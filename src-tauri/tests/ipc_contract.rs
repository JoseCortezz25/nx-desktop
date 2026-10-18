//! Cross-language contract test for the shared IPC error kernel.
//!
//! Issue #16, slice 1. The fixtures under `docs/ipc/fixtures/` are the single
//! source shared with the TypeScript suite
//! (`src/shared/ipc/contracts.test.ts`). Serializing [`AppErrorDto`] must
//! reproduce each fixture value exactly, and deserializing it back must be
//! lossless, so a `request_id` vs `requestId` mismatch fails deterministically
//! here.

use nx_desktop_lib::features::conversations::dto::{
    ConversationDto, CreateConversationRequestDto, MessageRoleDto, ToolCallKindDto,
    ToolCallStatusDto,
};
use nx_desktop_lib::features::projects::dto::{
    ApprovalModeDto, CreateProjectRequestDto, CreatedProjectDto, HookApprovalStatusDto,
    ListWorkspaceBranchesRequestDto, ProjectDto, SetProjectApprovalModeRequestDto,
};
use nx_desktop_lib::features::providers::dto::{ListModelsRequestDto, ModelDto, ProviderDto};
use nx_desktop_lib::features::runs::dto::{
    CancelRunRequestDto, GetRunRequestDto, RunDto, RunStatusDto, RunStreamEventDto,
    StartRunRequestDto,
};
use nx_desktop_lib::features::subagents::dto::{
    CancelSubagentRequestDto, ListSubagentsRequestDto, SubagentDto, SubagentStatusDto,
};
use nx_desktop_lib::ipc::error::{AppErrorCode, AppErrorDto};
use serde::Serialize;
use serde::de::DeserializeOwned;
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

/// Deserializes a fixture value into a DTO and asserts it serializes back
/// byte-for-byte, so a Rust field name or enum value drift fails here.
fn assert_round_trip<T>(name: &str, expected: Value)
where
    T: DeserializeOwned + Serialize,
{
    let dto: T = serde_json::from_value(expected.clone())
        .unwrap_or_else(|error| panic!("{name} must deserialize: {error}"));
    assert_eq!(
        serde_json::to_value(&dto).expect("DTO serializes"),
        expected,
        "{name} round-trips byte-for-byte"
    );
}

/// Asserts a strict request DTO rejects an extra field.
macro_rules! assert_rejects_unknown_fields {
    ($ty:ty, $value:expr) => {{
        let mut value = $value;
        value["unexpected"] = json!(true);
        let result: Result<$ty, _> = serde_json::from_value(value);
        assert!(
            result.is_err(),
            concat!(stringify!($ty), " must reject unknown request fields")
        );
    }};
}

#[test]
fn slice_two_responses_round_trip_through_their_dtos() {
    assert_round_trip::<Vec<ProviderDto>>(
        "providers-list-providers.json",
        fixture!("providers-list-providers.json")["response"].clone(),
    );
    assert_round_trip::<Vec<ModelDto>>(
        "providers-list-models.json",
        fixture!("providers-list-models.json")["response"].clone(),
    );
    assert_round_trip::<Vec<ProjectDto>>(
        "projects-list-projects.json",
        fixture!("projects-list-projects.json")["response"].clone(),
    );
    assert_round_trip::<CreatedProjectDto>(
        "projects-create-project.json",
        fixture!("projects-create-project.json")["response"].clone(),
    );
    assert_round_trip::<Vec<ProjectDto>>(
        "projects-set-project-approval-mode.json",
        fixture!("projects-set-project-approval-mode.json")["response"].clone(),
    );
    assert_round_trip::<Vec<String>>(
        "projects-list-workspace-branches.json",
        fixture!("projects-list-workspace-branches.json")["response"].clone(),
    );
    assert_round_trip::<Vec<ConversationDto>>(
        "conversations-list-conversations.json",
        fixture!("conversations-list-conversations.json")["response"].clone(),
    );
    assert_round_trip::<ConversationDto>(
        "conversations-create-conversation.json",
        fixture!("conversations-create-conversation.json")["response"].clone(),
    );
}

#[test]
fn slice_two_requests_round_trip_through_their_dtos() {
    assert_round_trip::<ListModelsRequestDto>(
        "providers-list-models.json",
        fixture!("providers-list-models.json")["request"].clone(),
    );
    assert_round_trip::<CreateProjectRequestDto>(
        "projects-create-project.json",
        fixture!("projects-create-project.json")["request"].clone(),
    );
    assert_round_trip::<SetProjectApprovalModeRequestDto>(
        "projects-set-project-approval-mode.json",
        fixture!("projects-set-project-approval-mode.json")["request"].clone(),
    );
    assert_round_trip::<ListWorkspaceBranchesRequestDto>(
        "projects-list-workspace-branches.json",
        fixture!("projects-list-workspace-branches.json")["request"].clone(),
    );
    assert_round_trip::<CreateConversationRequestDto>(
        "conversations-create-conversation.json",
        fixture!("conversations-create-conversation.json")["request"].clone(),
    );
}

#[test]
fn create_conversation_request_accepts_an_absent_title() {
    let value = json!({ "projectId": "proj-design-system" });
    let request: CreateConversationRequestDto =
        serde_json::from_value(value.clone()).expect("title is optional");
    assert_eq!(request.title, None);
    assert_eq!(
        serde_json::to_value(&request).expect("request serializes"),
        value,
        "an absent title stays absent on the wire"
    );
}

#[test]
fn strict_requests_reject_unknown_fields() {
    assert_rejects_unknown_fields!(
        ListModelsRequestDto,
        fixture!("providers-list-models.json")["request"].clone()
    );
    assert_rejects_unknown_fields!(
        CreateProjectRequestDto,
        fixture!("projects-create-project.json")["request"].clone()
    );
    assert_rejects_unknown_fields!(
        SetProjectApprovalModeRequestDto,
        fixture!("projects-set-project-approval-mode.json")["request"].clone()
    );
    assert_rejects_unknown_fields!(
        ListWorkspaceBranchesRequestDto,
        fixture!("projects-list-workspace-branches.json")["request"].clone()
    );
    assert_rejects_unknown_fields!(
        CreateConversationRequestDto,
        fixture!("conversations-create-conversation.json")["request"].clone()
    );
}

#[test]
fn feature_enums_use_the_documented_wire_values() {
    for (mode, wire) in [
        (ApprovalModeDto::AskAlways, "ask_always"),
        (ApprovalModeDto::AutoApprove, "auto_approve"),
        (ApprovalModeDto::FullAccess, "full_access"),
    ] {
        assert_eq!(
            serde_json::to_value(mode).expect("mode serializes"),
            json!(wire)
        );
    }

    for (status, wire) in [
        (HookApprovalStatusDto::Pending, "pending"),
        (HookApprovalStatusDto::Approved, "approved"),
        (HookApprovalStatusDto::Rejected, "rejected"),
    ] {
        assert_eq!(
            serde_json::to_value(status).expect("status serializes"),
            json!(wire)
        );
    }

    for (role, wire) in [
        (MessageRoleDto::User, "user"),
        (MessageRoleDto::Assistant, "assistant"),
        (MessageRoleDto::System, "system"),
    ] {
        assert_eq!(
            serde_json::to_value(role).expect("role serializes"),
            json!(wire)
        );
    }

    for (kind, wire) in [
        (ToolCallKindDto::Search, "search"),
        (ToolCallKindDto::Command, "command"),
        (ToolCallKindDto::ListFiles, "list_files"),
        (ToolCallKindDto::Diff, "diff"),
        (ToolCallKindDto::Subagent, "subagent"),
    ] {
        assert_eq!(
            serde_json::to_value(kind).expect("kind serializes"),
            json!(wire)
        );
    }

    for (status, wire) in [
        (ToolCallStatusDto::Pending, "pending"),
        (ToolCallStatusDto::Running, "running"),
        (ToolCallStatusDto::Completed, "completed"),
        (ToolCallStatusDto::Failed, "failed"),
    ] {
        assert_eq!(
            serde_json::to_value(status).expect("tool status serializes"),
            json!(wire)
        );
    }
}

#[test]
fn authority_bearing_requests_carry_the_project_id() {
    let set_mode = fixture!("projects-set-project-approval-mode.json");
    assert!(
        set_mode["request"]["projectId"].is_string(),
        "set_project_approval_mode must carry projectId for the Authority tier"
    );
    let branches = fixture!("projects-list-workspace-branches.json");
    assert!(
        branches["request"]["projectId"].is_string(),
        "list_workspace_branches must carry projectId for the Authority tier"
    );
    let conversation = fixture!("conversations-create-conversation.json");
    assert!(
        conversation["request"]["projectId"].is_string(),
        "create_conversation must carry projectId for the Authority tier"
    );
}

#[test]
fn slice_three_requests_round_trip_through_their_dtos() {
    assert_round_trip::<StartRunRequestDto>(
        "runs-start-run.json",
        fixture!("runs-start-run.json")["request"].clone(),
    );
    assert_round_trip::<CancelRunRequestDto>(
        "runs-cancel-run.json",
        fixture!("runs-cancel-run.json")["request"].clone(),
    );
    assert_round_trip::<GetRunRequestDto>(
        "runs-get-run.json",
        fixture!("runs-get-run.json")["request"].clone(),
    );
    assert_round_trip::<ListSubagentsRequestDto>(
        "subagents-list-subagents.json",
        fixture!("subagents-list-subagents.json")["request"].clone(),
    );
    assert_round_trip::<CancelSubagentRequestDto>(
        "subagents-cancel-subagent.json",
        fixture!("subagents-cancel-subagent.json")["request"].clone(),
    );
}

#[test]
fn slice_three_responses_round_trip_through_their_dtos() {
    assert_round_trip::<RunDto>(
        "runs-start-run.json",
        fixture!("runs-start-run.json")["response"].clone(),
    );
    assert_round_trip::<RunDto>(
        "runs-cancel-run.json",
        fixture!("runs-cancel-run.json")["response"].clone(),
    );
    assert_round_trip::<RunDto>(
        "runs-get-run.json",
        fixture!("runs-get-run.json")["response"].clone(),
    );
    assert_round_trip::<Vec<SubagentDto>>(
        "subagents-list-subagents.json",
        fixture!("subagents-list-subagents.json")["response"].clone(),
    );
    assert_round_trip::<SubagentDto>(
        "subagents-cancel-subagent.json",
        fixture!("subagents-cancel-subagent.json")["response"].clone(),
    );
}

/// The wire `kind` of a deserialized frame, for asserting the variant matches
/// the fixture key it was read from.
fn stream_kind(event: &RunStreamEventDto) -> &'static str {
    match event {
        RunStreamEventDto::Started { .. } => "started",
        RunStreamEventDto::TextDelta { .. } => "textDelta",
        RunStreamEventDto::ToolActivity { .. } => "toolActivity",
        RunStreamEventDto::Completed { .. } => "completed",
        RunStreamEventDto::Failed { .. } => "failed",
        RunStreamEventDto::Cancelled { .. } => "cancelled",
    }
}

#[test]
fn run_stream_frames_round_trip_through_the_tagged_union() {
    let events = fixture!("runs-stream-events.json")["events"].clone();
    let object = events
        .as_object()
        .expect("the stream fixture is an object keyed by kind");
    assert_eq!(object.len(), 6, "one canonical frame per stream kind");

    for (kind, expected) in object {
        let event: RunStreamEventDto = serde_json::from_value(expected.clone())
            .unwrap_or_else(|error| panic!("{kind} must deserialize: {error}"));
        assert_eq!(
            serde_json::to_value(&event).expect("frame serializes"),
            *expected,
            "{kind} round-trips byte-for-byte"
        );
        assert_eq!(
            stream_kind(&event),
            kind.as_str(),
            "{kind} deserializes to its own variant"
        );
    }
}

#[test]
fn slice_three_wire_keys_are_camel_case_only() {
    let start = fixture!("runs-start-run.json")["request"].clone();
    for key in [
        "conversationId",
        "projectId",
        "providerId",
        "modelId",
        "effortLevel",
        "prompt",
        "environment",
    ] {
        assert!(start.get(key).is_some(), "start_run must carry {key}");
    }
    assert!(
        start.get("conversation_id").is_none(),
        "no snake_case key may leak across the wire"
    );

    let text_delta = fixture!("runs-stream-events.json")["events"]["textDelta"].clone();
    assert!(text_delta.get("runId").is_some());
    assert!(
        text_delta.get("run_id").is_none(),
        "stream frames use camelCase on the wire"
    );
}

#[test]
fn strict_run_and_subagent_requests_reject_unknown_fields() {
    assert_rejects_unknown_fields!(
        StartRunRequestDto,
        fixture!("runs-start-run.json")["request"].clone()
    );
    assert_rejects_unknown_fields!(
        CancelRunRequestDto,
        fixture!("runs-cancel-run.json")["request"].clone()
    );
    assert_rejects_unknown_fields!(
        GetRunRequestDto,
        fixture!("runs-get-run.json")["request"].clone()
    );
    assert_rejects_unknown_fields!(
        ListSubagentsRequestDto,
        fixture!("subagents-list-subagents.json")["request"].clone()
    );
    assert_rejects_unknown_fields!(
        CancelSubagentRequestDto,
        fixture!("subagents-cancel-subagent.json")["request"].clone()
    );
}

#[test]
fn start_run_rejects_an_approval_mode_field() {
    let mut request = fixture!("runs-start-run.json")["request"].clone();
    request["approvalMode"] = json!("full_access");
    let result: Result<StartRunRequestDto, _> = serde_json::from_value(request);
    assert!(
        result.is_err(),
        "start_run must reject approvalMode: the policy is project-scoped in Rust"
    );
}

#[test]
fn run_stream_rejects_an_unknown_kind() {
    let mut frame = fixture!("runs-stream-events.json")["events"]["started"].clone();
    frame["kind"] = json!("hookReviewRequired");
    let result: Result<RunStreamEventDto, _> = serde_json::from_value(frame);
    assert!(
        result.is_err(),
        "the six-kind union is closed; hookReviewRequired needs a #20 amendment"
    );
}

#[test]
fn every_run_stream_frame_carries_run_id_and_seq() {
    let events = fixture!("runs-stream-events.json")["events"].clone();
    let object = events
        .as_object()
        .expect("the stream fixture is an object keyed by kind");
    for (kind, frame) in object {
        assert!(
            frame["runId"].is_string(),
            "{kind} must carry a string runId"
        );
        assert!(frame["seq"].is_u64(), "{kind} must carry a numeric seq");
    }
}

#[test]
fn authority_bearing_slice_three_requests_carry_their_ids() {
    let start = fixture!("runs-start-run.json");
    assert!(
        start["request"]["projectId"].is_string(),
        "start_run must carry projectId for the Authority tier"
    );
    assert!(
        start["request"]["conversationId"].is_string(),
        "start_run must carry the parent conversationId"
    );

    for (name, request) in [
        ("runs-cancel-run.json", fixture!("runs-cancel-run.json")),
        ("runs-get-run.json", fixture!("runs-get-run.json")),
    ] {
        assert!(
            request["request"]["runId"].is_string(),
            "{name} must carry the authority-bearing runId"
        );
    }

    let list = fixture!("subagents-list-subagents.json");
    assert!(
        list["request"]["runId"].is_string(),
        "list_subagents must carry the parent runId"
    );

    let cancel = fixture!("subagents-cancel-subagent.json");
    assert!(
        cancel["request"]["runId"].is_string(),
        "cancel_subagent must carry the parent runId"
    );
    assert!(
        cancel["request"]["subagentId"].is_string(),
        "cancel_subagent must carry the subagentId"
    );
}

#[test]
fn run_and_subagent_statuses_use_the_documented_wire_values() {
    for (status, wire) in [
        (RunStatusDto::Pending, "pending"),
        (RunStatusDto::Streaming, "streaming"),
        (RunStatusDto::Completed, "completed"),
        (RunStatusDto::Failed, "failed"),
        (RunStatusDto::Cancelled, "cancelled"),
    ] {
        assert_eq!(
            serde_json::to_value(status).expect("run status serializes"),
            json!(wire)
        );
    }

    for (status, wire) in [
        (SubagentStatusDto::Processing, "processing"),
        (SubagentStatusDto::Finished, "finished"),
        (SubagentStatusDto::Failed, "failed"),
        (SubagentStatusDto::Cancelled, "cancelled"),
    ] {
        assert_eq!(
            serde_json::to_value(status).expect("subagent status serializes"),
            json!(wire)
        );
    }
}
