//! Hook source and executor ports (issue #20).
//!
//! Two real external boundaries live here: provider hook configuration
//! ([`HookSource`]) and operating-system process execution ([`HookExecutor`]).
//! The service depends on both traits; `adapters/fake.rs` and
//! `adapters/process.rs` provide the concrete implementations, and tests inject
//! their own.
//!
//! [`HookInvocation`] is already fully validated by the service: executable,
//! argument array, authorized `cwd` and timeout. Adapters must never rebuild a
//! shell string from it.

use std::future::Future;
use std::path::PathBuf;
use std::pin::Pin;

use super::domain::{HookCommand, HookReport};

/// A boxed, sendable future returned by the executor port.
pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// Source of the hooks a project should review.
///
/// Implementations translate provider configuration into validated domain
/// values; vendor payloads never leak through the trait.
pub trait HookSource: Send + Sync {
    /// Every hook configured for this project, in provider order.
    fn hooks_for(&self, project_id: &str) -> Vec<HookReport>;
}

/// One approved `PreToolUse` hook ready to run.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HookInvocation {
    pub hook_id: String,
    pub command: HookCommand,
    /// Authorized workspace root resolved by the service.
    pub cwd: PathBuf,
    pub timeout_ms: u32,
}

/// How one hook process ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HookRunOutcome {
    /// The process exited with status 0.
    Succeeded,
    /// The process exited with a non-zero status.
    Failed,
    /// The process was killed after its timeout elapsed.
    TimedOut,
}

/// Result of running one hook.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HookRun {
    pub hook_id: String,
    pub outcome: HookRunOutcome,
    pub exit_code: Option<i32>,
}

/// The ways process execution can fail before producing an outcome.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HookExecutionError {
    /// The executable could not be spawned (missing binary, bad `cwd`, ...).
    SpawnFailed,
    /// The process was spawned but its status could not be collected.
    WaitFailed,
}

/// Executes one approved hook without a shell.
pub trait HookExecutor: Send + Sync {
    fn execute(
        &self,
        invocation: HookInvocation,
    ) -> BoxFuture<'_, Result<HookRun, HookExecutionError>>;
}
