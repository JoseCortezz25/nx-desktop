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
use nx_desktop_lib::features::diff::dto::{
    DiffFileDto, DiffLineDto, DiffLineKindDto, ReadWorkspaceDiffRequestDto,
};
use nx_desktop_lib::features::files::dto::{
    OpenInTargetRequestDto, OpenTargetAvailabilityDto, OpenTargetDto,
};
use nx_desktop_lib::features::hooks::dto::{
    HookDto, ListHooksRequestDto, SetHookDecisionRequestDto,
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
use nx_desktop_lib::features::workspace::dto::{FileDocumentDto, ReadFileRequestDto};
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

#[test]
fn slice_four_requests_round_trip_through_their_dtos() {
    assert_round_trip::<ReadFileRequestDto>(
        "workspace-read-file.json",
        fixture!("workspace-read-file.json")["request"].clone(),
    );
    assert_round_trip::<ReadWorkspaceDiffRequestDto>(
        "diff-read-workspace-diff.json",
        fixture!("diff-read-workspace-diff.json")["request"].clone(),
    );
    assert_round_trip::<OpenInTargetRequestDto>(
        "files-open-in-target.json",
        fixture!("files-open-in-target.json")["request"].clone(),
    );
    assert_round_trip::<ListHooksRequestDto>(
        "hooks-list-hooks.json",
        fixture!("hooks-list-hooks.json")["request"].clone(),
    );
    assert_round_trip::<SetHookDecisionRequestDto>(
        "hooks-set-hook-decision.json",
        fixture!("hooks-set-hook-decision.json")["request"].clone(),
    );
}

#[test]
fn slice_four_responses_round_trip_through_their_dtos() {
    assert_round_trip::<Option<FileDocumentDto>>(
        "workspace-read-file.json",
        fixture!("workspace-read-file.json")["response"].clone(),
    );
    assert_round_trip::<Vec<DiffFileDto>>(
        "diff-read-workspace-diff.json",
        fixture!("diff-read-workspace-diff.json")["response"].clone(),
    );
    assert_round_trip::<Vec<OpenTargetAvailabilityDto>>(
        "files-list-open-targets.json",
        fixture!("files-list-open-targets.json")["response"].clone(),
    );
    assert_round_trip::<Vec<HookDto>>(
        "hooks-list-hooks.json",
        fixture!("hooks-list-hooks.json")["response"].clone(),
    );
    assert_round_trip::<HookDto>(
        "hooks-set-hook-decision.json",
        fixture!("hooks-set-hook-decision.json")["response"].clone(),
    );
}

#[test]
fn read_file_and_open_in_target_keep_their_optional_and_void_shapes() {
    let missing: Option<FileDocumentDto> =
        serde_json::from_value(Value::Null).expect("null is a missing document");
    assert_eq!(missing, None);
    assert_eq!(
        serde_json::to_value(missing).expect("missing document serializes"),
        Value::Null,
        "an absent document stays null on the wire"
    );
    assert_eq!(
        fixture!("files-open-in-target.json")["response"],
        Value::Null,
        "open_in_target resolves null, matching Promise<void>"
    );
    assert!(
        fixture!("files-list-open-targets.json")
            .get("request")
            .is_none(),
        "list_open_targets is parameterless: the report is machine-scoped"
    );
}

#[test]
fn strict_slice_four_requests_reject_unknown_fields() {
    assert_rejects_unknown_fields!(
        ReadFileRequestDto,
        fixture!("workspace-read-file.json")["request"].clone()
    );
    assert_rejects_unknown_fields!(
        ReadWorkspaceDiffRequestDto,
        fixture!("diff-read-workspace-diff.json")["request"].clone()
    );
    assert_rejects_unknown_fields!(
        OpenInTargetRequestDto,
        fixture!("files-open-in-target.json")["request"].clone()
    );
    assert_rejects_unknown_fields!(
        ListHooksRequestDto,
        fixture!("hooks-list-hooks.json")["request"].clone()
    );
    assert_rejects_unknown_fields!(
        SetHookDecisionRequestDto,
        fixture!("hooks-set-hook-decision.json")["request"].clone()
    );
}

#[test]
fn slice_four_closed_enums_use_the_documented_wire_values() {
    for (kind, wire) in [
        (DiffLineKindDto::Context, "context"),
        (DiffLineKindDto::Added, "added"),
        (DiffLineKindDto::Removed, "removed"),
    ] {
        assert_eq!(
            serde_json::to_value(kind).expect("diff line kind serializes"),
            json!(wire)
        );
    }

    for (target, wire) in [
        (OpenTargetDto::Editor, "editor"),
        (OpenTargetDto::ViewSource, "view_source"),
        (OpenTargetDto::SearchInFile, "search_in_file"),
        (OpenTargetDto::RevealInFileManager, "reveal_in_file_manager"),
        (OpenTargetDto::CopyPath, "copy_path"),
    ] {
        assert_eq!(
            serde_json::to_value(target).expect("open target serializes"),
            json!(wire)
        );
    }
}

#[test]
fn slice_four_closed_enums_reject_unknown_values() {
    let mut target = fixture!("files-open-in-target.json")["request"].clone();
    target["target"] = json!("terminal");
    let result: Result<OpenInTargetRequestDto, _> = serde_json::from_value(target);
    assert!(
        result.is_err(),
        "open_in_target accepts only the five documented targets"
    );

    let mut line =
        fixture!("diff-read-workspace-diff.json")["response"][0]["hunks"][0]["lines"][0].clone();
    line["kind"] = json!("moved");
    let result: Result<DiffLineDto, _> = serde_json::from_value(line);
    assert!(
        result.is_err(),
        "diff lines accept only context/added/removed"
    );

    let mut decision = fixture!("hooks-set-hook-decision.json")["request"].clone();
    decision["approvalStatus"] = json!("maybe");
    let result: Result<SetHookDecisionRequestDto, _> = serde_json::from_value(decision);
    assert!(
        result.is_err(),
        "hook decisions accept only pending/approved/rejected"
    );
}

#[test]
fn authority_bearing_slice_four_requests_carry_the_project_id() {
    for (name, value) in [
        (
            "workspace-read-file.json",
            fixture!("workspace-read-file.json"),
        ),
        (
            "diff-read-workspace-diff.json",
            fixture!("diff-read-workspace-diff.json"),
        ),
        (
            "files-open-in-target.json",
            fixture!("files-open-in-target.json"),
        ),
        ("hooks-list-hooks.json", fixture!("hooks-list-hooks.json")),
        (
            "hooks-set-hook-decision.json",
            fixture!("hooks-set-hook-decision.json"),
        ),
    ] {
        assert!(
            value["request"]["projectId"].is_string(),
            "{name} must carry projectId for the Authority tier"
        );
    }

    let read = fixture!("workspace-read-file.json");
    assert!(
        read["request"]["path"].is_string(),
        "read_file must carry the workspace-relative path Rust validates"
    );
    let open = fixture!("files-open-in-target.json");
    assert!(
        open["request"]["path"].is_string(),
        "open_in_target must carry the workspace-relative path Rust validates"
    );
}

#[test]
fn hook_requests_stay_project_scoped_and_carry_no_run_id() {
    for (name, value) in [
        ("hooks-list-hooks.json", fixture!("hooks-list-hooks.json")),
        (
            "hooks-set-hook-decision.json",
            fixture!("hooks-set-hook-decision.json"),
        ),
    ] {
        assert!(
            value["request"]["projectId"].is_string(),
            "{name} carries the project that remembers the decision"
        );
        assert!(
            value["request"].get("runId").is_none(),
            "{name} must not carry runId: the decision is project-scoped, not run-scoped"
        );
    }
}

#[test]
fn slice_four_wire_keys_are_camel_case_only() {
    let read = fixture!("workspace-read-file.json")["request"].clone();
    assert!(read.get("projectId").is_some());
    assert!(
        read.get("project_id").is_none(),
        "read_file uses camelCase on the wire"
    );

    let diff = fixture!("diff-read-workspace-diff.json")["response"][0].clone();
    assert!(diff.get("addedCount").is_some());
    assert!(diff.get("removedCount").is_some());
    assert!(
        diff.get("added_count").is_none(),
        "diff counts use camelCase on the wire"
    );

    let hook = fixture!("hooks-list-hooks.json")["response"][0].clone();
    assert!(hook.get("isNew").is_some());
    assert!(hook.get("timeoutMs").is_some());
    assert!(hook.get("approvalStatus").is_some());
    assert!(
        hook.get("is_new").is_none(),
        "hook fields use camelCase on the wire"
    );
}
