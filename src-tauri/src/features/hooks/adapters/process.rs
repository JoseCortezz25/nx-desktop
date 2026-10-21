//! OS process hook executor (issue #20).
//!
//! The real [`HookExecutor`] adapter. Security rules enforced here
//! (`.opencode/rules/security-and-capabilities.md` §4):
//!
//! - executable identity + argument array, never a shell string;
//! - the authorized `cwd` resolved by the service;
//! - a cleared environment with only `PATH` (and `SystemRoot` on Windows);
//! - closed stdin/stdout/stderr, so a hook cannot read agent input or leak
//!   output into logs;
//! - the provider timeout, with an explicit kill when it elapses.
//!
//! Batch files (`.cmd`, `.bat`) are not executable through `CreateProcess` on
//! Windows; the adapter reports `SpawnFailed` instead of routing them through a
//! shell. Supporting them would need a dedicated, reviewed Windows path.

use std::process::Stdio;
use std::time::Duration;

use tokio::process::Command;

use super::super::ports::{
    BoxFuture, HookExecutionError, HookExecutor, HookInvocation, HookRun, HookRunOutcome,
};

/// Spawns approved hooks directly, without a shell.
#[derive(Debug, Default, Clone, Copy)]
pub struct ProcessHookExecutor;

impl HookExecutor for ProcessHookExecutor {
    fn execute(
        &self,
        invocation: HookInvocation,
    ) -> BoxFuture<'_, Result<HookRun, HookExecutionError>> {
        Box::pin(async move {
            let mut command = Command::new(invocation.command.program());
            command
                .args(invocation.command.args())
                .current_dir(&invocation.cwd)
                .env_clear()
                .env("PATH", std::env::var_os("PATH").unwrap_or_default())
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .kill_on_drop(true);
            #[cfg(windows)]
            if let Some(system_root) = std::env::var_os("SystemRoot") {
                command.env("SystemRoot", system_root);
            }

            let mut child = command
                .spawn()
                .map_err(|_| HookExecutionError::SpawnFailed)?;
            let hook_id = invocation.hook_id;
            let timeout = Duration::from_millis(u64::from(invocation.timeout_ms));
            match tokio::time::timeout(timeout, child.wait()).await {
                Ok(Ok(status)) => Ok(HookRun {
                    hook_id,
                    outcome: if status.success() {
                        HookRunOutcome::Succeeded
                    } else {
                        HookRunOutcome::Failed
                    },
                    exit_code: status.code(),
                }),
                Ok(Err(_)) => Err(HookExecutionError::WaitFailed),
                Err(_) => {
                    // `kill_on_drop` also covers this, but awaiting the kill
                    // guarantees the child is gone before the next hook starts.
                    let _ = child.kill().await;
                    let _ = child.wait().await;
                    Ok(HookRun {
                        hook_id,
                        outcome: HookRunOutcome::TimedOut,
                        exit_code: None,
                    })
                }
            }
        })
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use crate::features::hooks::domain::HookCommand;

    fn invocation(program: &str, args: &str, timeout_ms: u32) -> HookInvocation {
        let source = if args.is_empty() {
            program.to_owned()
        } else {
            format!("{program} {args}")
        };
        HookInvocation {
            hook_id: "hook-test".to_owned(),
            command: HookCommand::parse(&source).expect("fixture command parses"),
            cwd: std::env::temp_dir(),
            timeout_ms,
        }
    }

    #[tokio::test]
    async fn succeeds_on_a_zero_exit() {
        let run = ProcessHookExecutor
            .execute(invocation("true", "", 1_000))
            .await
            .expect("process spawns");
        assert_eq!(run.outcome, HookRunOutcome::Succeeded);
        assert_eq!(run.exit_code, Some(0));
    }

    #[tokio::test]
    async fn reports_a_non_zero_exit() {
        let run = ProcessHookExecutor
            .execute(invocation("false", "", 1_000))
            .await
            .expect("process spawns");
        assert_eq!(run.outcome, HookRunOutcome::Failed);
        assert_eq!(run.exit_code, Some(1));
    }

    #[tokio::test]
    async fn kills_a_process_that_exceeds_its_timeout() {
        let run = ProcessHookExecutor
            .execute(invocation("sleep", "5", 20))
            .await
            .expect("process spawns");
        assert_eq!(run.outcome, HookRunOutcome::TimedOut);
        assert_eq!(run.exit_code, None);
    }

    #[tokio::test]
    async fn reports_a_missing_executable() {
        let error = ProcessHookExecutor
            .execute(invocation("nx-definitely-not-a-real-binary", "", 1_000))
            .await
            .expect_err("missing executable");
        assert_eq!(error, HookExecutionError::SpawnFailed);
    }
}
