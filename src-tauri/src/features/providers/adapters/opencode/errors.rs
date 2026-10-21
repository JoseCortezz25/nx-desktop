//! OpenCode failure → domain failure mapping (issue #27).
//!
//! Every failure becomes a [`RunFailure`], which `runs/commands.rs` projects
//! onto the closed `AppErrorDto` code set. Messages are fixed,
//! adapter-authored summaries: the vendor `message`, the process stderr and
//! the raw event line are never copied into a failure. At most a sanitized
//! error *name* (ASCII identifier, ≤ 64 chars) is appended for diagnosis.
//!
//! | OpenCode signal                                        | Run failure code      |
//! | ------------------------------------------------------ | --------------------- |
//! | binary not found / cannot be started                   | `ProviderUnavailable` |
//! | `error` event: authentication / API key errors         | `ProviderUnavailable` |
//! | `error` event: rate limit / quota exhausted            | `ProviderUnavailable` |
//! | `error` event: model or provider not found             | `ProviderUnavailable` |
//! | `error` event: `APIError` 401/403/404/408/429/5xx      | `ProviderUnavailable` |
//! | `error` event: other `APIError` 4xx                    | `Internal`            |
//! | `error` event: anything else (`unknown`, `aborted`...) | `Internal`            |
//! | stream stalled past the idle timeout                   | `ProviderUnavailable` |
//! | malformed JSON line / non-zero exit without an event   | `Internal`            |
//! | workspace folder unavailable                           | `Internal`            |

use serde_json::Value;

use crate::features::runs::domain::RunFailure;

const MAX_ERROR_NAME_CHARS: usize = 64;

/// The OpenCode binary could not be located.
pub fn binary_not_found() -> RunFailure {
    RunFailure::provider_unavailable(format!(
        "OpenCode is not installed or could not be found; install it or set {}",
        super::config::BINARY_ENV_VAR
    ))
}

/// The OpenCode process could not be started.
pub fn spawn_failure() -> RunFailure {
    RunFailure::provider_unavailable("could not start the OpenCode process")
}

/// No stream line arrived within the idle timeout.
pub fn stalled_stream() -> RunFailure {
    RunFailure::provider_unavailable("the OpenCode run stalled and was abandoned")
}

/// A stream line that looked like JSON could not be decoded.
pub fn malformed_stream() -> RunFailure {
    RunFailure::internal("OpenCode sent a malformed run event")
}

/// Reading the child's output failed.
pub fn read_failure() -> RunFailure {
    RunFailure::provider_unavailable("lost the connection to the OpenCode process")
}

/// The process exited unsuccessfully without reporting an `error` event.
pub fn exit_failure(code: Option<i32>) -> RunFailure {
    match code {
        Some(code) => RunFailure::internal(format!("OpenCode exited with status {code}")),
        None => RunFailure::internal("OpenCode was terminated by a signal"),
    }
}

/// The project has no workspace folder this machine can run in.
pub fn workspace_unavailable() -> RunFailure {
    RunFailure::internal("the project workspace folder is not available on this machine")
}

/// Maps the `error` object of a `run --format json` `error` line.
///
/// OpenCode reports several shapes: `{"name": "APIError", "data":
/// {"statusCode": 429, ...}}`, effect-ai errors tagged with `_tag`
/// (`RateLimitError`, `AuthenticationError`, ...) and CLI errors as
/// `{"type": "unknown", "message": ...}`. Only the name and status code are
/// read.
pub fn event_failure(error: Option<&Value>) -> RunFailure {
    let name = error.and_then(error_name);
    let status = error.and_then(status_code);
    let suffix = name
        .as_deref()
        .map(|name| format!(" ({name})"))
        .unwrap_or_default();
    let lowered = name.as_deref().unwrap_or_default().to_ascii_lowercase();

    if lowered.contains("auth") || lowered.contains("apikey") || lowered.contains("credential") {
        return RunFailure::provider_unavailable(format!(
            "OpenCode could not authenticate with the model provider{suffix}"
        ));
    }
    if lowered.contains("ratelimit") || lowered.contains("quota") {
        return RunFailure::provider_unavailable(format!(
            "the model provider rate limit or quota was reached{suffix}"
        ));
    }
    if lowered.contains("notfound") {
        return RunFailure::provider_unavailable(format!(
            "the selected OpenCode model or provider is not available{suffix}"
        ));
    }
    match status {
        Some(code @ (401 | 403 | 404 | 408 | 429 | 500..=599)) => RunFailure::provider_unavailable(
            format!("the model provider returned HTTP {code}{suffix}"),
        ),
        Some(code @ 400..=499) => RunFailure::internal(format!(
            "the model provider rejected the request with HTTP {code}{suffix}"
        )),
        _ if lowered == "apierror" => RunFailure::provider_unavailable(format!(
            "the model provider reported an error{suffix}"
        )),
        _ => RunFailure::internal(format!("OpenCode reported a run error{suffix}")),
    }
}

fn error_name(error: &Value) -> Option<String> {
    ["_tag", "name", "type"]
        .iter()
        .filter_map(|key| error.get(key).and_then(Value::as_str))
        .find_map(sanitize_name)
}

fn status_code(error: &Value) -> Option<u16> {
    error
        .get("data")
        .and_then(|data| data.get("statusCode"))
        .or_else(|| error.get("statusCode"))
        .and_then(Value::as_u64)
        .and_then(|code| u16::try_from(code).ok())
}

/// Keeps an error name only when it is a plain identifier, so no free-form
/// vendor text (which could echo a request) reaches the failure message.
fn sanitize_name(name: &str) -> Option<String> {
    let valid = !name.is_empty()
        && name.chars().count() <= MAX_ERROR_NAME_CHARS
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'));
    valid.then(|| name.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::runs::domain::RunFailureCode;

    fn failure(raw: &str) -> RunFailure {
        let value: Value = serde_json::from_str(raw).expect("fixture parses");
        event_failure(Some(&value))
    }

    #[test]
    fn maps_vendor_error_shapes_to_the_closed_code_set() {
        let cases = [
            (
                r#"{"name":"APIError","data":{"message":"sk-secret","statusCode":429}}"#,
                RunFailureCode::ProviderUnavailable,
            ),
            (
                r#"{"name":"APIError","data":{"statusCode":503}}"#,
                RunFailureCode::ProviderUnavailable,
            ),
            (
                r#"{"name":"APIError","data":{"statusCode":400}}"#,
                RunFailureCode::Internal,
            ),
            (
                r#"{"name":"APIError"}"#,
                RunFailureCode::ProviderUnavailable,
            ),
            (
                r#"{"_tag":"AuthenticationError","kind":"InvalidKey"}"#,
                RunFailureCode::ProviderUnavailable,
            ),
            (
                r#"{"name":"ProviderAuthError","data":{"message":"x"}}"#,
                RunFailureCode::ProviderUnavailable,
            ),
            (
                r#"{"_tag":"RateLimitError"}"#,
                RunFailureCode::ProviderUnavailable,
            ),
            (
                r#"{"_tag":"QuotaExhaustedError"}"#,
                RunFailureCode::ProviderUnavailable,
            ),
            (
                r#"{"name":"ProviderModelNotFoundError"}"#,
                RunFailureCode::ProviderUnavailable,
            ),
            (
                r#"{"type":"unknown","message":"You must provide a message"}"#,
                RunFailureCode::Internal,
            ),
            (
                r#"{"type":"aborted","message":"Session interrupted: x"}"#,
                RunFailureCode::Internal,
            ),
        ];
        for (raw, code) in cases {
            let mapped = failure(raw);
            assert_eq!(mapped.code, code, "{raw}");
            assert!(!mapped.message.contains("sk-secret"), "{raw}");
            assert!(!mapped.message.contains("must provide"), "{raw}");
        }
        assert_eq!(
            event_failure(None).code,
            RunFailureCode::Internal,
            "an error line without a body is still a failure"
        );
    }

    #[test]
    fn free_form_names_are_not_echoed() {
        let mapped = failure(r#"{"name":"Bearer sk-123 rejected","data":{"statusCode":401}}"#);
        assert_eq!(mapped.code, RunFailureCode::ProviderUnavailable);
        assert!(!mapped.message.contains("sk-123"));
        assert!(mapped.message.contains("401"));
    }

    #[test]
    fn a_missing_binary_is_a_provider_outage_with_a_fixed_message() {
        let failure = binary_not_found();
        assert_eq!(failure.code, RunFailureCode::ProviderUnavailable);
        assert!(failure.message.contains("NX_DESKTOP_OPENCODE_BIN"));
        assert_eq!(exit_failure(Some(2)).code, RunFailureCode::Internal);
    }
}
