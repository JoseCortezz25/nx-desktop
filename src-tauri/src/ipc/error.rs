//! Public, serializable IPC error contract.
//!
//! Slice 1 of issue #16. This mirrors `src/shared/ipc/contracts.ts`: every Tauri
//! command returns `Result<TDto, AppErrorDto>`, and [`AppErrorDto`] is the only
//! error shape that crosses the boundary. The `snake_case` codes are the exact
//! five already translated in `src/shared/i18n/messages.ts` and pinned by the
//! shared fixtures in `docs/ipc/fixtures/` (`.claude/rules/ipc-and-contracts.md`
//! §4).

use serde::{Deserialize, Serialize};

/// Stable `snake_case` error code carried by [`AppErrorDto`].
///
/// The set is closed: it matches the `sharedMessages.errors` keys in the
/// frontend and the `AppErrorCode` union in `src/shared/ipc/contracts.ts`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AppErrorCode {
    /// The request failed the Shape/Limits/Invariants validation tiers.
    ValidationFailed,
    /// The request failed the Authority tier (workspace or approval policy).
    PermissionDenied,
    /// The selected provider adapter is unavailable or timed out.
    ProviderUnavailable,
    /// The run or operation was cancelled.
    Cancelled,
    /// An unexpected internal failure with no safer public classification.
    InternalError,
}

impl AppErrorCode {
    /// Default retry posture for this code, mirrored by the shared fixtures.
    ///
    /// A caller may retry a transient provider outage or an unclassified
    /// internal failure; it may not blindly retry a rejected request, a denied
    /// operation or a user cancellation.
    pub fn is_retryable(self) -> bool {
        matches!(self, Self::ProviderUnavailable | Self::InternalError)
    }
}

/// Serializable error shape crossing the IPC boundary.
///
/// Rust fields stay `snake_case`; `#[serde(rename_all = "camelCase")]` puts
/// `code`, `message`, `retryable` and `requestId` on the wire. `message` is a
/// safe diagnostic summary — never a secret, raw provider error or stack trace.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppErrorDto {
    /// Closed, stable error identifier.
    pub code: AppErrorCode,
    /// Safe diagnostic summary; the UI resolves display copy from `code`.
    pub message: String,
    /// Whether the caller may safely retry the same intent.
    pub retryable: bool,
    /// Correlation id logged in Rust, carried back for support and tracing.
    pub request_id: String,
}

impl AppErrorDto {
    /// Builds an error with the diagnostic summary and correlation id supplied
    /// by the command, deriving `retryable` from the code's default posture.
    pub fn new(
        code: AppErrorCode,
        message: impl Into<String>,
        request_id: impl Into<String>,
    ) -> Self {
        Self {
            code,
            retryable: code.is_retryable(),
            message: message.into(),
            request_id: request_id.into(),
        }
    }
}
