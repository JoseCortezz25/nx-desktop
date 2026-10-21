//! Claude vendor error → domain failure mapping (issue #25).
//!
//! Every vendor failure becomes a [`RunFailure`], which `runs/commands.rs`
//! projects onto the closed `AppErrorDto` code set (`provider_unavailable`,
//! `internal_error`, ...). Messages are fixed, adapter-authored summaries:
//! the vendor `message`, response headers and request headers (which carry
//! the API key) are never copied into a failure, so nothing a server echoes
//! back can reach the webview.
//!
//! | Vendor signal                         | Run failure code      |
//! | ------------------------------------- | --------------------- |
//! | 400 `invalid_request_error`           | `Internal`            |
//! | 401 `authentication_error`            | `ProviderUnavailable` |
//! | 403 `permission_error`                | `ProviderUnavailable` |
//! | 404 `not_found_error`                 | `ProviderUnavailable` |
//! | 413 `request_too_large`               | `Internal`            |
//! | 429 `rate_limit_error`                | `ProviderUnavailable` |
//! | 500 `api_error`                       | `ProviderUnavailable` |
//! | 529 `overloaded_error`                | `ProviderUnavailable` |
//! | other 5xx / transport / stalled       | `ProviderUnavailable` |
//! | other 4xx / malformed stream          | `Internal`            |
//! | missing credential                    | `ProviderUnavailable` |

use super::wire::ErrorEnvelope;
use crate::features::runs::domain::RunFailure;

/// Failure for an `error` type reported by the vendor, falling back to the
/// HTTP status when the type is absent or unknown.
pub fn vendor_failure(status: Option<u16>, error_type: Option<&str>) -> RunFailure {
    match error_type {
        Some("invalid_request_error") => {
            RunFailure::internal("Claude rejected the request as invalid (invalid_request_error)")
        }
        Some("authentication_error") => RunFailure::provider_unavailable(
            "Claude rejected the configured credentials (authentication_error)",
        ),
        Some("permission_error") => RunFailure::provider_unavailable(
            "the configured Claude credentials lack permission for this request (permission_error)",
        ),
        Some("not_found_error") => RunFailure::provider_unavailable(
            "the requested Claude model or endpoint was not found (not_found_error)",
        ),
        Some("request_too_large") => {
            RunFailure::internal("the request exceeds Claude's size limit (request_too_large)")
        }
        Some("rate_limit_error") => {
            RunFailure::provider_unavailable("Claude rate limit reached (rate_limit_error)")
        }
        Some("api_error") => {
            RunFailure::provider_unavailable("Claude reported an internal error (api_error)")
        }
        Some("overloaded_error") => {
            RunFailure::provider_unavailable("Claude is temporarily overloaded (overloaded_error)")
        }
        _ => status_failure(status),
    }
}

/// Failure for an HTTP status with no recognised vendor error type.
fn status_failure(status: Option<u16>) -> RunFailure {
    match status {
        Some(400) => vendor_failure(None, Some("invalid_request_error")),
        Some(401) => vendor_failure(None, Some("authentication_error")),
        Some(403) => vendor_failure(None, Some("permission_error")),
        Some(404) => vendor_failure(None, Some("not_found_error")),
        Some(413) => vendor_failure(None, Some("request_too_large")),
        Some(429) => vendor_failure(None, Some("rate_limit_error")),
        Some(500) => vendor_failure(None, Some("api_error")),
        Some(529) => vendor_failure(None, Some("overloaded_error")),
        Some(code @ 500..=599) => {
            RunFailure::provider_unavailable(format!("Claude returned HTTP {code}"))
        }
        Some(code) => RunFailure::internal(format!("Claude returned unexpected HTTP {code}")),
        None => RunFailure::provider_unavailable("Claude reported a stream error"),
    }
}

/// Maps a non-2xx response from its status and (possibly empty or
/// non-JSON) body.
pub fn http_failure(status: u16, body: &[u8]) -> RunFailure {
    let envelope = serde_json::from_slice::<ErrorEnvelope>(body).ok();
    vendor_failure(
        Some(status),
        envelope
            .as_ref()
            .map(|envelope| envelope.error.kind.as_str()),
    )
}

/// No credential is configured for the Claude provider.
pub fn missing_credential() -> RunFailure {
    RunFailure::provider_unavailable(
        "Claude credentials are not configured; set ANTHROPIC_API_KEY for the app process",
    )
}

/// The configured credential cannot be sent as an HTTP header value.
pub fn unusable_credential() -> RunFailure {
    RunFailure::provider_unavailable("the configured Claude credential is not a valid API key")
}

/// The request could not be delivered or the connection broke.
pub fn transport_failure() -> RunFailure {
    RunFailure::provider_unavailable("could not reach the Claude API")
}

/// No bytes arrived within the idle timeout.
pub fn stalled_stream() -> RunFailure {
    RunFailure::provider_unavailable("the Claude stream stalled and was abandoned")
}

/// The connection closed before `message_stop`.
pub fn truncated_stream() -> RunFailure {
    RunFailure::provider_unavailable("the Claude stream ended before the response completed")
}

/// A stream event could not be parsed.
pub fn malformed_stream() -> RunFailure {
    RunFailure::internal("Claude sent a malformed stream event")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::runs::domain::RunFailureCode;

    fn envelope(kind: &str) -> Vec<u8> {
        format!(r#"{{"type":"error","error":{{"type":"{kind}","message":"secret-ish detail"}}}}"#)
            .into_bytes()
    }

    #[test]
    fn maps_every_documented_http_error() {
        let cases = [
            (400, "invalid_request_error", RunFailureCode::Internal),
            (
                401,
                "authentication_error",
                RunFailureCode::ProviderUnavailable,
            ),
            (403, "permission_error", RunFailureCode::ProviderUnavailable),
            (404, "not_found_error", RunFailureCode::ProviderUnavailable),
            (413, "request_too_large", RunFailureCode::Internal),
            (429, "rate_limit_error", RunFailureCode::ProviderUnavailable),
            (500, "api_error", RunFailureCode::ProviderUnavailable),
            (529, "overloaded_error", RunFailureCode::ProviderUnavailable),
        ];
        for (status, kind, code) in cases {
            let with_body = http_failure(status, &envelope(kind));
            assert_eq!(with_body.code, code, "{status} {kind}");
            assert!(with_body.message.contains(kind), "{status} {kind}");
            assert!(!with_body.message.contains("secret-ish"), "{status} {kind}");

            let without_body = http_failure(status, b"<html>gateway</html>");
            assert_eq!(without_body, with_body, "status fallback for {status}");
        }
    }

    #[test]
    fn unlisted_statuses_fall_back_by_class() {
        assert_eq!(
            http_failure(503, b"").code,
            RunFailureCode::ProviderUnavailable
        );
        assert_eq!(http_failure(418, b"").code, RunFailureCode::Internal);
    }

    #[test]
    fn stream_error_events_use_the_same_table() {
        assert_eq!(
            vendor_failure(None, Some("overloaded_error")).code,
            RunFailureCode::ProviderUnavailable
        );
        assert_eq!(
            vendor_failure(None, Some("something_new")).code,
            RunFailureCode::ProviderUnavailable
        );
    }

    #[test]
    fn missing_credentials_are_a_provider_outage_without_secrets() {
        let failure = missing_credential();
        assert_eq!(failure.code, RunFailureCode::ProviderUnavailable);
        assert!(failure.message.contains("ANTHROPIC_API_KEY"));
    }
}
