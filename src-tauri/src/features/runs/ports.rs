//! Run execution ports (issue #19).
//!
//! Two external seams live here: the adapter that executes a run
//! ([`AgentRunner`]) and the sink that delivers its frames to the outside
//! (the Tauri `Channel` in `commands.rs`). Both are traits because the real
//! engines (#25–#27) and the webview transport are real boundaries; the
//! supervisor and the service depend on these ports, never on Tauri.
//!
//! [`Cancellation`] is the cooperative signal `cancel_run` propagates into an
//! adapter. It is cloneable, race-free and runtime-agnostic beyond Tokio's
//! `Notify`.

use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use tokio::sync::Notify;

use super::domain::{RunEnvironment, RunFailure, RunFrame, StartRunSpec};
use crate::features::conversations::domain::ToolCall;

/// A boxed, sendable future returned by the adapter port.
pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// Provider-facing payload of one attempt.
///
/// Vendor-neutral by construction: adapters translate it into their own wire
/// format, and no provider payload leaks back through the port.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunExecutionRequest {
    pub conversation_id: String,
    pub project_id: String,
    pub provider_id: String,
    pub model_id: String,
    pub effort_level: String,
    pub prompt: String,
    pub environment: RunEnvironment,
}

impl RunExecutionRequest {
    /// Projects a validated start spec into the adapter payload.
    pub fn from_spec(spec: &StartRunSpec) -> Self {
        Self {
            conversation_id: spec.conversation_id.as_str().to_owned(),
            project_id: spec.project_id.as_str().to_owned(),
            provider_id: spec.provider_id.as_str().to_owned(),
            model_id: spec.model_id.as_str().to_owned(),
            effort_level: spec.effort_level.as_str().to_owned(),
            prompt: spec.prompt.as_str().to_owned(),
            environment: spec.environment.clone(),
        }
    }
}

/// Incremental output an adapter may emit mid-run.
///
/// Deliberately narrow: `started` and the three terminal frames belong to the
/// supervisor, so an adapter can never invent or duplicate a lifecycle
/// transition.
pub trait RunProgressSink: Send + Sync {
    fn text_delta(&self, text: String);
    fn tool_activity(&self, tool_call: ToolCall);
}

/// Executes one run against a coding-agent engine.
///
/// `execute` must stop promptly when `cancellation` fires, returning
/// [`RunFailure::cancelled`]; the supervisor resolves the race between that
/// return and a concurrent `cancel_run`.
pub trait AgentRunner: Send + Sync {
    fn execute<'a>(
        &'a self,
        request: RunExecutionRequest,
        cancellation: Cancellation,
        sink: Arc<dyn RunProgressSink>,
    ) -> BoxFuture<'a, Result<(), RunFailure>>;
}

/// Outbound transport for fully sequenced frames.
///
/// The supervisor calls this with the run id and sequence already attached;
/// `commands.rs` adapts it to a `Channel<RunStreamEventDto>`.
pub trait RunEventSink: Send + Sync {
    fn emit(&self, frame: RunFrame);
}

#[derive(Debug, Default)]
struct CancellationInner {
    cancelled: AtomicBool,
    notify: Notify,
}

/// Cooperative cancellation shared between the supervisor and one adapter.
///
/// Cloning is cheap and every clone observes the same signal. No lock is
/// involved, so the adapter can await [`Cancellation::cancelled`] without
/// blocking `cancel_run`.
#[derive(Debug, Clone, Default)]
pub struct Cancellation {
    inner: Arc<CancellationInner>,
}

impl Cancellation {
    pub fn new() -> Self {
        Self::default()
    }

    /// Marks the run cancelled and wakes every waiter. Idempotent.
    pub fn cancel(&self) {
        self.inner.cancelled.store(true, Ordering::SeqCst);
        self.inner.notify.notify_waiters();
    }

    pub fn is_cancelled(&self) -> bool {
        self.inner.cancelled.load(Ordering::SeqCst)
    }

    /// Resolves when [`Cancellation::cancel`] runs, or immediately when it
    /// already ran. The waiter is registered before the flag is re-checked, so
    /// a cancellation between the two is never lost (the classic
    /// check-then-await race, which `Notify::notified` alone does not close).
    pub async fn cancelled(&self) {
        loop {
            let notified = self.inner.notify.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();
            if self.is_cancelled() {
                return;
            }
            notified.await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn cancellation_wakes_a_waiter() {
        let cancellation = Cancellation::new();
        assert!(!cancellation.is_cancelled());
        let waiter = {
            let cancellation = cancellation.clone();
            tokio::spawn(async move { cancellation.cancelled().await })
        };
        cancellation.cancel();
        assert!(cancellation.is_cancelled());
        tokio::time::timeout(std::time::Duration::from_secs(1), waiter)
            .await
            .expect("waiter resolves")
            .expect("waiter task joins");
    }

    #[tokio::test]
    async fn cancellation_is_idempotent_and_observable_after_the_fact() {
        let cancellation = Cancellation::new();
        cancellation.cancel();
        cancellation.cancel();
        assert!(cancellation.is_cancelled());
        tokio::time::timeout(
            std::time::Duration::from_millis(50),
            cancellation.cancelled(),
        )
        .await
        .expect("an already-cancelled token resolves immediately");
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn cancellation_is_not_lost_when_it_races_waiter_registration() {
        for _ in 0..200 {
            let cancellation = Cancellation::new();
            let waiter = {
                let cancellation = cancellation.clone();
                tokio::spawn(async move { cancellation.cancelled().await })
            };
            tokio::task::yield_now().await;
            cancellation.cancel();
            tokio::time::timeout(std::time::Duration::from_secs(1), waiter)
                .await
                .expect("waiter resolves")
                .expect("waiter task joins");
        }
    }
}
