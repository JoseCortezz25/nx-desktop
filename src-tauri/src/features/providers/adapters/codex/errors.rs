//! Codex vendor error → domain failure mapping (issue #26).
//!
//! Every failure becomes a [`RunFailure`], which `runs/commands.rs` projects
//! onto the closed `AppErrorDto` code set. Messages are fixed,
//! adapter-authored summaries: the vendor message, the CLI's stderr and the
//! child environment are never copied into a failure. Vendor text is only
//! *inspected* to pick one of the fixed summaries below.
//!
//! | Codex signal                                         | Run failure code      |
//! | ---------------------------------------------------- | --------------------- |
//! | binary not found / not executable / spawn failure    | `ProviderUnavailable` |
//! | `turn.failed` or exit ≠ 0 mentioning auth / login    | `ProviderUnavailable` |
//! | `turn.failed` or exit ≠ 0 mentioning rate/usage limit| `ProviderUnavailable` |
//! | `turn.failed` or exit ≠ 0 mentioning the model       | `ProviderUnavailable` |
//! | other `turn.failed` / exit ≠ 0 / killed by a signal  | `ProviderUnavailable` |
//! | exit before `turn.completed`, stalled stream         | `ProviderUnavailable` |
//! | CLI rejected the adapter's arguments (version skew)  | `Internal`            |
//! | malformed / oversized JSONL line                     | `Internal`            |
//! | workspace folder missing or unresolvable             | `Internal`            |

use crate::features::runs::domain::RunFailure;

/// No `codex` executable could be resolved.
pub fn binary_not_found() -> RunFailure {
    RunFailure::provider_unavailable(
        "the Codex CLI was not found; install it and run `codex login`, or set NX_CODEX_BIN to its absolute path",
    )
}

/// The configured `NX_CODEX_BIN` is not an absolute path to an executable.
pub fn configured_binary_invalid() -> RunFailure {
    RunFailure::provider_unavailable(
        "NX_CODEX_BIN does not point to an executable Codex CLI (an absolute path is required)",
    )
}

/// The OS refused to start the resolved executable.
pub fn spawn_failure() -> RunFailure {
    RunFailure::provider_unavailable("the Codex CLI could not be started")
}

/// The project's workspace folder cannot serve as the process `cwd`.
pub fn workspace_unavailable() -> RunFailure {
    RunFailure::internal("the project's workspace folder is not available on this machine")
}

/// No event arrived within the idle timeout.
pub fn stalled_stream() -> RunFailure {
    RunFailure::provider_unavailable("the Codex CLI stopped producing events and was terminated")
}

/// The process ended cleanly before `turn.completed`.
pub fn truncated_stream() -> RunFailure {
    RunFailure::provider_unavailable("the Codex CLI exited before the turn completed")
}

/// A stdout line was not a valid event.
pub fn malformed_stream() -> RunFailure {
    RunFailure::internal("the Codex CLI sent a malformed event")
}

/// Reading the child's stdout failed.
pub fn transport_failure() -> RunFailure {
    RunFailure::provider_unavailable("lost the connection to the Codex CLI process")
}

/// `turn.failed`: classified from the vendor message, never forwarding it.
pub fn turn_failure(message: Option<&str>) -> RunFailure {
    classify(message.unwrap_or_default())
        .unwrap_or_else(|| RunFailure::provider_unavailable("Codex reported that the turn failed"))
}

/// A non-zero exit (or signal) without a turn outcome, classified from the
/// last stream error notice and the captured stderr tail.
pub fn exit_failure(code: Option<i32>, diagnostics: &str) -> RunFailure {
    if is_usage_error(diagnostics) {
        return RunFailure::internal(
            "the installed Codex CLI rejected the adapter's arguments; update Codex",
        );
    }
    if let Some(failure) = classify(diagnostics) {
        return failure;
    }
    match code {
        Some(code) => {
            RunFailure::provider_unavailable(format!("the Codex CLI exited with status {code}"))
        }
        None => RunFailure::provider_unavailable("the Codex CLI was terminated unexpectedly"),
    }
}

fn classify(text: &str) -> Option<RunFailure> {
    let lower = text.to_ascii_lowercase();
    let mentions = |needles: &[&str]| needles.iter().any(|needle| lower.contains(needle));
    if mentions(&[
        "401",
        "unauthorized",
        "not logged in",
        "codex login",
        "authentication",
        "auth.json",
    ]) {
        return Some(RunFailure::provider_unavailable(
            "Codex is not signed in or its credentials were rejected; run `codex login`",
        ));
    }
    if mentions(&["429", "rate limit", "usage limit", "quota"]) {
        return Some(RunFailure::provider_unavailable(
            "Codex usage or rate limit reached",
        ));
    }
    if lower.contains("model")
        && mentions(&[
            "not supported",
            "does not exist",
            "not found",
            "unsupported",
            "not available",
        ])
    {
        return Some(RunFailure::provider_unavailable(
            "the selected model is not available to this Codex account",
        ));
    }
    None
}

/// clap usage errors: the CLI did not understand an argument.
fn is_usage_error(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    lower.contains("unexpected argument")
        || lower.contains("unrecognized subcommand")
        || lower.contains("invalid value")
        || lower.contains("usage: codex")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::runs::domain::RunFailureCode;

    #[test]
    fn turn_failures_are_classified_without_echoing_the_vendor_message() {
        let cases = [
            (
                "unexpected status 401 Unauthorized: token sk-secret",
                "codex login",
            ),
            ("You've hit your usage limit (sk-secret)", "limit"),
            ("The model `gpt-x` does not exist sk-secret", "model"),
            ("stream disconnected sk-secret", "turn failed"),
        ];
        for (vendor, expected) in cases {
            let failure = turn_failure(Some(vendor));
            assert_eq!(
                failure.code,
                RunFailureCode::ProviderUnavailable,
                "{vendor}"
            );
            assert!(failure.message.contains(expected), "{vendor}");
            assert!(!failure.message.contains("sk-secret"), "{vendor}");
        }
        assert_eq!(turn_failure(None).code, RunFailureCode::ProviderUnavailable);
    }

    #[test]
    fn exit_failures_fall_back_to_the_status() {
        let failure = exit_failure(Some(7), "something odd");
        assert_eq!(failure.code, RunFailureCode::ProviderUnavailable);
        assert!(failure.message.contains("status 7"));
        assert!(!failure.message.contains("odd"));
        assert!(exit_failure(None, "").message.contains("terminated"));
    }

    #[test]
    fn argument_rejections_are_internal() {
        let failure = exit_failure(
            Some(2),
            "error: unexpected argument '--ephemeral' found\n\nUsage: codex exec [OPTIONS]",
        );
        assert_eq!(failure.code, RunFailureCode::Internal);
    }

    #[test]
    fn login_problems_on_stderr_are_a_provider_outage() {
        let failure = exit_failure(Some(1), "Error: Not logged in. Run `codex login`.");
        assert_eq!(failure.code, RunFailureCode::ProviderUnavailable);
        assert!(failure.message.contains("codex login"));
    }

    #[test]
    fn binary_not_found_names_the_fix() {
        let failure = binary_not_found();
        assert_eq!(failure.code, RunFailureCode::ProviderUnavailable);
        assert!(failure.message.contains("NX_CODEX_BIN"));
    }
}
