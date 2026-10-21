//! Codex provider adapter (issue #26).
//!
//! One adapter, two ports: [`AgentProvider`] serves the Codex catalog to the
//! provider registry, and [`AgentRunner`] drives the user's installed Codex
//! CLI (`codex exec --json`) as a supervised child process, translating its
//! JSONL event stream into the same progress sink the fake runner uses, so
//! the supervisor emits the identical six-kind `Channel` frames.
//!
//! Layout:
//!
//! - `config.rs` — model table, effort mapping, binary override, timeouts.
//! - `wire.rs` — `codex exec --json` event payloads (never leave the adapter).
//! - `jsonl.rs` — chunk-boundary-safe JSON Lines framer.
//! - `translate.rs` — vendor events → domain progress and outcome.
//! - `errors.rs` — CLI/process failures → `RunFailure`.
//! - `process.rs` — binary resolution, argv, minimal env, process group.
//! - `client.rs` — the turn driver with cancellation.
//! - `workspace.rs` — project → canonical workspace `cwd`.
//!
//! Credentials: none. Codex authenticates with its own login (`codex login`,
//! stored by the CLI under `CODEX_HOME`); the app never reads, stores or
//! forwards a Codex token, and API-key variables are not passed to the child.
//! Without an installed CLI the provider still lists, and each run fails with
//! a mapped `provider_unavailable` error before anything is spawned.

mod client;
pub mod config;
mod errors;
mod jsonl;
mod process;
mod translate;
mod wire;
pub mod workspace;

use std::sync::Arc;

use self::config::{CODEX_PROVIDER_ID, CodexConfig, wire_effort};
use self::process::{EnvLookup, Invocation, resolve_binary};
use self::workspace::{WorkspaceResolver, run_directory};
use super::super::domain::{EffortLevel, Model, ModelId, Provider, ProviderId};
use super::super::ports::AgentProvider;
use crate::features::runs::domain::RunFailure;
use crate::features::runs::ports::{
    AgentRunner, BoxFuture, Cancellation, RunExecutionRequest, RunProgressSink,
};

/// Why the adapter could not be constructed.
#[derive(Debug)]
pub enum CodexSetupError {
    /// The configured provider id failed domain validation.
    InvalidProviderId,
}

/// The Codex engine adapter.
pub struct CodexAgentProvider {
    provider_id: ProviderId,
    config: CodexConfig,
    workspaces: Arc<dyn WorkspaceResolver>,
    env: EnvLookup,
}

impl CodexAgentProvider {
    /// The production adapter, reading the child allowlist from the real
    /// process environment at run time.
    pub fn new(
        config: CodexConfig,
        workspaces: Arc<dyn WorkspaceResolver>,
    ) -> Result<Self, CodexSetupError> {
        Self::with_env(config, workspaces, Box::new(|name| std::env::var_os(name)))
    }

    /// Same adapter with an injected variable reader (tests).
    pub fn with_env(
        config: CodexConfig,
        workspaces: Arc<dyn WorkspaceResolver>,
        env: EnvLookup,
    ) -> Result<Self, CodexSetupError> {
        let provider_id =
            ProviderId::new(CODEX_PROVIDER_ID).map_err(|_| CodexSetupError::InvalidProviderId)?;
        Ok(Self {
            provider_id,
            config,
            workspaces,
            env,
        })
    }

    /// Provider id this adapter serves (`codex`).
    pub fn provider_id(&self) -> &ProviderId {
        &self.provider_id
    }

    async fn run(
        &self,
        request: RunExecutionRequest,
        cancellation: Cancellation,
        sink: Arc<dyn RunProgressSink>,
    ) -> Result<(), RunFailure> {
        let model = self.config.find_model(&request.model_id).ok_or_else(|| {
            RunFailure::internal("the selected model is not offered by the Codex adapter")
        })?;
        let effort = wire_effort(model, &request.effort_level).ok_or_else(|| {
            RunFailure::internal("the selected effort level is not supported by this Codex model")
        })?;
        let binary = resolve_binary(self.config.binary.as_deref(), &self.env)?;
        let cwd = run_directory(self.workspaces.as_ref(), &request.project_id)?;
        if cancellation.is_cancelled() {
            return Err(RunFailure::cancelled());
        }
        let invocation = Invocation {
            binary,
            cwd,
            model: model.id,
            effort,
        };
        client::run_turn(
            &invocation,
            &self.env,
            &request.prompt,
            &self.config,
            &cancellation,
            sink.as_ref(),
        )
        .await
    }
}

impl AgentProvider for CodexAgentProvider {
    fn catalog(&self) -> Vec<Provider> {
        let models = self
            .config
            .models
            .iter()
            .filter_map(|model| {
                Some(Model {
                    id: ModelId::new(model.id).ok()?,
                    display_name: model.display_name.to_owned(),
                    supported_effort_levels: model
                        .effort_levels
                        .iter()
                        .filter_map(|level| EffortLevel::new(*level).ok())
                        .collect(),
                })
            })
            .collect();
        vec![Provider {
            id: self.provider_id.clone(),
            display_name: "Codex".to_owned(),
            icon: "codex".to_owned(),
            subtitle: "OpenAI coding agent".to_owned(),
            available_models: models,
        }]
    }
}

impl AgentRunner for CodexAgentProvider {
    fn execute<'a>(
        &'a self,
        request: RunExecutionRequest,
        cancellation: Cancellation,
        sink: Arc<dyn RunProgressSink>,
    ) -> BoxFuture<'a, Result<(), RunFailure>> {
        Box::pin(self.run(request, cancellation, sink))
    }
}

#[cfg(all(test, unix))]
mod tests;
