//! OpenCode provider adapter (issue #27).
//!
//! One adapter, two ports: [`AgentProvider`] serves the models OpenCode
//! itself reports, and [`AgentRunner`] drives `opencode run --format json`
//! as a supervised child process, translating its JSON lines into the same
//! progress sink the fake runner uses, so the supervisor emits the identical
//! six-kind `Channel` frames.
//!
//! Layout:
//!
//! - `config.rs` — binary resolution, timeouts, environment allowlist.
//! - `wire.rs` — vendor payloads (never leave the adapter).
//! - `discovery.rs` — `model.list` discovery and catalog mapping.
//! - `translate.rs` — run lines → domain progress.
//! - `errors.rs` — vendor/process failures → `RunFailure`.
//! - `process.rs` — the supervised child and its bounded line reader.
//! - `workspace.rs` — the authorized working directory of a run.
//!
//! OpenCode owns its provider credentials; the adapter never reads, stores or
//! forwards them. Discovery runs once at startup and is refreshed lazily
//! (see [`OpenCodeAgentProvider::ready`]); a missing binary or a failed
//! discovery leaves the provider listed with no models, and runs fail with
//! `provider_unavailable`.

pub mod config;
mod discovery;
mod errors;
mod process;
mod translate;
mod wire;
pub mod workspace;

#[cfg(test)]
mod test_support;
#[cfg(test)]
mod tests;

use std::ffi::OsString;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock, RwLockReadGuard, RwLockWriteGuard};
use std::time::{Duration, Instant};

use tokio::sync::watch;

use self::config::{OPENCODE_PROVIDER_ID, OpenCodeConfig};
use self::discovery::{OpenCodeModel, discover};
use self::errors::{
    binary_not_found, exit_failure, read_failure, spawn_failure, stalled_stream,
    workspace_unavailable,
};
use self::process::{LineReader, MAX_LINE_BYTES, SupervisedChild};
use self::translate::{LineTranslator, Translation};
use self::workspace::WorkspaceDirectory;
use super::super::domain::{EffortLevel, Model, ModelId, Provider, ProviderId};
use super::super::ports::{AgentProvider, CatalogReady};
use crate::features::runs::domain::RunFailure;
use crate::features::runs::ports::{
    AgentRunner, BoxFuture, Cancellation, RunExecutionRequest, RunProgressSink,
};

/// Extra time a waiter gives an in-flight discovery beyond its own bounds.
const READY_WAIT_MARGIN: Duration = Duration::from_secs(2);

/// Why the adapter could not be constructed.
#[derive(Debug)]
pub enum OpenCodeSetupError {
    /// The configured provider id failed domain validation.
    InvalidProviderId,
}

#[derive(Debug, Default)]
struct CacheState {
    models: Vec<OpenCodeModel>,
    last_attempt: Option<Instant>,
    last_success: Option<Instant>,
}

/// The discovered catalog plus the single-flight refresh bookkeeping. The
/// `RwLock` is only held for clones and swaps, never across `.await`.
struct CatalogCache {
    state: RwLock<CacheState>,
    refreshing: AtomicBool,
    generation: watch::Sender<u64>,
}

impl CatalogCache {
    fn new() -> Self {
        Self {
            state: RwLock::new(CacheState::default()),
            refreshing: AtomicBool::new(false),
            generation: watch::Sender::new(0),
        }
    }

    fn read(&self) -> RwLockReadGuard<'_, CacheState> {
        self.state
            .read()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn write(&self) -> RwLockWriteGuard<'_, CacheState> {
        self.state
            .write()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

/// Clears the in-flight flag and wakes waiters even when the refreshing
/// future is dropped mid-discovery.
struct RefreshGuard<'a>(&'a CatalogCache);

impl Drop for RefreshGuard<'_> {
    fn drop(&mut self) {
        self.0.refreshing.store(false, Ordering::SeqCst);
        self.0.generation.send_modify(|generation| *generation += 1);
    }
}

/// The OpenCode engine adapter.
pub struct OpenCodeAgentProvider {
    provider_id: ProviderId,
    config: OpenCodeConfig,
    workspace: Arc<dyn WorkspaceDirectory>,
    cache: CatalogCache,
}

impl OpenCodeAgentProvider {
    pub fn new(
        config: OpenCodeConfig,
        workspace: Arc<dyn WorkspaceDirectory>,
    ) -> Result<Self, OpenCodeSetupError> {
        let provider_id = ProviderId::new(OPENCODE_PROVIDER_ID)
            .map_err(|_| OpenCodeSetupError::InvalidProviderId)?;
        Ok(Self {
            provider_id,
            config,
            workspace,
            cache: CatalogCache::new(),
        })
    }

    /// Provider id this adapter serves (`opencode`).
    pub fn provider_id(&self) -> &ProviderId {
        &self.provider_id
    }

    /// Runs discovery now unless one is already in flight (single flight),
    /// in which case it waits for that one. Bounded by the discovery timeout.
    pub async fn refresh(&self) {
        let mut changed = self.cache.generation.subscribe();
        if self
            .cache
            .refreshing
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            let bound =
                self.config.discovery_timeout + self.config.exit_timeout + READY_WAIT_MARGIN;
            let _ = tokio::time::timeout(bound, changed.changed()).await;
            return;
        }
        let _guard = RefreshGuard(&self.cache);
        let outcome = discover(&self.config).await;
        let now = Instant::now();
        let mut state = self.cache.write();
        state.last_attempt = Some(now);
        if let Ok(models) = outcome {
            state.models = models;
            state.last_success = Some(now);
        }
        // A failure keeps the last good catalog: a transient error must not
        // empty the selectors mid-session.
    }

    /// Whether the cached catalog is missing or stale.
    fn needs_refresh(&self) -> bool {
        let state = self.cache.read();
        let Some(last_attempt) = state.last_attempt else {
            return true;
        };
        match state.last_success {
            Some(success) if success >= last_attempt => {
                success.elapsed() >= self.config.catalog_ttl
            }
            _ => last_attempt.elapsed() >= self.config.retry_after_failure,
        }
    }

    fn cached_model(&self, model_id: &str) -> Option<OpenCodeModel> {
        self.cache
            .read()
            .models
            .iter()
            .find(|model| model.id == model_id)
            .cloned()
    }

    async fn run(
        &self,
        request: RunExecutionRequest,
        cancellation: Cancellation,
        sink: Arc<dyn RunProgressSink>,
    ) -> Result<(), RunFailure> {
        let model = self.cached_model(&request.model_id).ok_or_else(|| {
            RunFailure::internal("the selected model is not offered by the OpenCode adapter")
        })?;
        let wire_model = model.wire_model(&request.effort_level).ok_or_else(|| {
            RunFailure::internal(
                "the selected effort level is not supported by this OpenCode model",
            )
        })?;
        let cwd = self
            .workspace
            .directory(&request.project_id)
            .ok_or_else(workspace_unavailable)?;
        let binary = self.config.resolve_binary().ok_or_else(binary_not_found)?;
        if cancellation.is_cancelled() {
            return Err(RunFailure::cancelled());
        }

        let args: Vec<OsString> = ["run", "--standalone", "--format", "json", "--model"]
            .iter()
            .map(OsString::from)
            .chain(std::iter::once(OsString::from(wire_model)))
            .collect();
        let mut child =
            SupervisedChild::spawn(&binary, &args, &cwd, true).map_err(|_| spawn_failure())?;
        let idle = self.config.idle_timeout;
        let grace = self.config.cancel_grace;

        // The prompt goes through stdin, never argv: it cannot be parsed as
        // a flag and does not show up in the process list.
        let written = tokio::select! {
            biased;
            () = cancellation.cancelled() => {
                child.interrupt_then_kill(grace).await;
                return Err(RunFailure::cancelled());
            }
            written = tokio::time::timeout(idle, child.write_stdin(request.prompt.as_bytes())) => written,
        };
        if !matches!(written, Ok(Ok(()))) {
            child.kill().await;
            return Err(spawn_failure());
        }

        let stdout = child.take_stdout().ok_or_else(spawn_failure)?;
        let mut reader = LineReader::new(stdout, MAX_LINE_BYTES);
        let mut translator = LineTranslator::new();
        loop {
            let next = tokio::select! {
                biased;
                () = cancellation.cancelled() => {
                    child.interrupt_then_kill(grace).await;
                    return Err(RunFailure::cancelled());
                }
                next = tokio::time::timeout(idle, reader.next_line()) => next,
            };
            let line = match next {
                Err(_) => {
                    child.kill().await;
                    return Err(stalled_stream());
                }
                Ok(Err(_)) => {
                    child.kill().await;
                    return Err(read_failure());
                }
                Ok(Ok(None)) => break,
                Ok(Ok(Some(line))) => line,
            };
            // A cancel that lands between reads must not leak further frames.
            if cancellation.is_cancelled() {
                child.interrupt_then_kill(grace).await;
                return Err(RunFailure::cancelled());
            }
            match translator.apply(&line) {
                Translation::Skip => {}
                Translation::Text(text) => sink.text_delta(text),
                Translation::Tool(tool_call) => sink.tool_activity(tool_call),
                Translation::Failed(failure) => {
                    child.wait_or_kill(self.config.exit_timeout).await;
                    return Err(failure);
                }
            }
        }

        let status = child.wait_or_kill(self.config.exit_timeout).await;
        if cancellation.is_cancelled() {
            return Err(RunFailure::cancelled());
        }
        match status {
            Some(status) if status.success() => Ok(()),
            Some(status) => Err(exit_failure(status.code())),
            None => Err(exit_failure(None)),
        }
    }
}

impl AgentProvider for OpenCodeAgentProvider {
    fn catalog(&self) -> Vec<Provider> {
        let models = self
            .cache
            .read()
            .models
            .iter()
            .filter_map(|model| {
                Some(Model {
                    id: ModelId::new(model.id.as_str()).ok()?,
                    display_name: model.display_name.clone(),
                    supported_effort_levels: model
                        .effort_stops()
                        .into_iter()
                        .filter_map(|stop| EffortLevel::new(stop).ok())
                        .collect(),
                })
            })
            .collect();
        vec![Provider {
            id: self.provider_id.clone(),
            display_name: "OpenCode".to_owned(),
            icon: "opencode".to_owned(),
            subtitle: "Open-source coding agent".to_owned(),
            available_models: models,
        }]
    }

    /// Awaits the first discovery, or a refresh once the catalog is stale
    /// (TTL) or the last attempt failed (retry interval). Bounded by the
    /// discovery timeout; listings never wait on a healthy, fresh cache.
    fn ready(&self) -> CatalogReady<'_> {
        Box::pin(async move {
            if self.needs_refresh() {
                self.refresh().await;
            }
        })
    }
}

impl AgentRunner for OpenCodeAgentProvider {
    fn execute<'a>(
        &'a self,
        request: RunExecutionRequest,
        cancellation: Cancellation,
        sink: Arc<dyn RunProgressSink>,
    ) -> BoxFuture<'a, Result<(), RunFailure>> {
        Box::pin(self.run(request, cancellation, sink))
    }
}
