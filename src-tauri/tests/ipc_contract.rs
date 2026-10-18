//! Cross-language contract test for the shared IPC error kernel.
//!
//! Issue #16, slice 1. The fixtures under `docs/ipc/fixtures/` are the single
//! source shared with the TypeScript suite
//! (`src/shared/ipc/contracts.test.ts`). Serializing [`AppErrorDto`] must
//! reproduce each fixture value exactly, and deserializing it back must be
//! lossless, so a `request_id` vs `requestId` mismatch fails deterministically
//! here.

use nx_desktop_lib::ipc::error::{AppErrorCode, AppErrorDto};
use serde_json::{Value, json};

/// Loads one fixture from `docs/ipc/fixtures/` as a JSON value.
macro_rules! fixture {
    ($name:literal) => {{
        let raw = include_str!(concat!("../../docs/ipc/fixtures/", $name));
        serde_json::from_str::<Value>(raw).expect("fixture is valid JSON")
    }};
}

/// The five (name, value, code) triples that pin the closed error-code set.
fn fixtures() -> [(&'static str, Value, AppErrorCode); 5] {
    [
        (
            "app-error-validation-failed.json",
            fixture!("app-error-validation-failed.json"),
            AppErrorCode::ValidationFailed,
        ),
        (
            "app-error-permission-denied.json",
            fixture!("app-error-permission-denied.json"),
            AppErrorCode::PermissionDenied,
        ),
        (
            "app-error-provider-unavailable.json",
            fixture!("app-error-provider-unavailable.json"),
            AppErrorCode::ProviderUnavailable,
        ),
        (
            "app-error-cancelled.json",
            fixture!("app-error-cancelled.json"),
            AppErrorCode::Cancelled,
        ),
        (
            "app-error-internal-error.json",
            fixture!("app-error-internal-error.json"),
            AppErrorCode::InternalError,
        ),
    ]
}

#[test]
fn every_fixture_round_trips_through_app_error_dto() {
    for (name, expected, code) in fixtures() {
        let dto: AppErrorDto = serde_json::from_value(expected.clone())
            .unwrap_or_else(|error| panic!("{name} must deserialize into AppErrorDto: {error}"));
        assert_eq!(dto.code, code, "{name} pins its error code");
        assert_eq!(
            serde_json::to_value(&dto).expect("AppErrorDto serializes"),
            expected,
            "{name} round-trips byte-for-byte"
        );
    }
}

#[test]
fn error_codes_serialize_to_the_five_snake_case_strings() {
    let cases = [
        (AppErrorCode::ValidationFailed, "validation_failed"),
        (AppErrorCode::PermissionDenied, "permission_denied"),
        (AppErrorCode::ProviderUnavailable, "provider_unavailable"),
        (AppErrorCode::Cancelled, "cancelled"),
        (AppErrorCode::InternalError, "internal_error"),
    ];

    for (code, wire) in cases {
        assert_eq!(
            serde_json::to_value(code).expect("code serializes"),
            json!(wire),
            "code {code:?} must serialize as {wire}"
        );
    }
}

#[test]
fn app_error_dto_uses_camel_case_wire_keys_only() {
    let dto = AppErrorDto::new(
        AppErrorCode::ProviderUnavailable,
        "provider adapter did not respond before the timeout",
        "req-6c02f7a1",
    );
    let value = serde_json::to_value(&dto).expect("AppErrorDto serializes");

    assert_eq!(
        value,
        json!({
            "code": "provider_unavailable",
            "message": "provider adapter did not respond before the timeout",
            "retryable": true,
            "requestId": "req-6c02f7a1",
        })
    );
    assert!(
        value.get("request_id").is_none(),
        "no snake_case key may leak across the wire"
    );
}

#[test]
fn default_retry_posture_matches_the_fixtures() {
    assert!(AppErrorCode::ProviderUnavailable.is_retryable());
    assert!(AppErrorCode::InternalError.is_retryable());
    assert!(!AppErrorCode::ValidationFailed.is_retryable());
    assert!(!AppErrorCode::PermissionDenied.is_retryable());
    assert!(!AppErrorCode::Cancelled.is_retryable());
}
