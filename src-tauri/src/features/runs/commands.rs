//! Run commands (issue #19).
//!
//! Thin input adapters: validate the boundary (Shape via Serde, Limits via the
//! domain constructors, Invariants/Authority via [`super::service`]), spawn the
//! supervisor driver and map internal failures to [`AppErrorDto`]. No provider
//! protocol and no lifecycle rule lives here.
//!
//! `start_run` streams frames through a `tauri::ipc::Channel` adapted to the
//! Tauri-free [`RunEventSink`] port. A closed webview (panel unmounted) only
//! drops frames; the run keeps executing in the Rust core, which is the
//! "Panel Close Resilience" rule in `business-logic.md` §3.2.

use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use tauri::State;
use tauri::ipc::Channel;

use super::domain::{
    RunEnvironment, RunError, RunEvent, RunFailure, RunFailureCode, RunFrame, RunId, RunPrompt,
    RunSnapshot, RunStatus, StartRunSpec,
};
use super::dto::{
    CancelRunRequestDto, GetRunRequestDto, RunDto, RunStatusDto, RunStreamEventDto,
    StartRunRequestDto,
};
use super::ports::RunEventSink;
use super::service;
use super::supervisor::RunSupervisor;
use crate::features::conversations::domain::ConversationId;
use crate::features::conversations::dto::to_tool_call_dto;
use crate::features::conversations::service::ConversationStore;
use crate::features::projects::domain::ProjectId;
use crate::features::projects::service::ProjectStore;
use crate::features::providers::domain::{EffortLevel, ModelId, ProviderId, SelectionChainError};
use crate::features::providers::service::ProviderRegistry;
use crate::ipc::error::{AppErrorCode, AppErrorDto};

/// Monotonic suffix for command correlation ids (`req-<n>`).
static REQUEST_SEQ: AtomicU64 = AtomicU64::new(1);

fn request_id() -> String {
    format!("req-{}", REQUEST_SEQ.fetch_add(1, Ordering::Relaxed))
}

fn selection_message(error: &SelectionChainError) -> String {
    match error {
        SelectionChainError::EmptyProviderId => "providerId must not be empty".to_owned(),
        SelectionChainError::EmptyModelId => "modelId must not be empty".to_owned(),
        SelectionChainError::EmptyEffortLevel => "effortLevel must not be empty".to_owned(),
        SelectionChainError::IdTooLong { field, len } => {
            format!("{field} exceeds the maximum accepted size ({len} bytes)")
        }
        SelectionChainError::UnknownProvider { provider_id } => {
            format!("unknown provider: {provider_id}")
        }
        SelectionChainError::UnknownModel {
            provider_id,
            model_id,
        } => format!("model {model_id} does not belong to provider {provider_id}"),
        SelectionChainError::UnsupportedEffort { model_id, effort } => {
            format!("model {model_id} does not expose effort stop {effort}")
        }
    }
}

fn run_error(error: RunError) -> AppErrorDto {
    let (code, message) = match &error {
        RunError::UnknownConversation { conversation_id } => (
            AppErrorCode::PermissionDenied,
            format!("unknown conversation: {conversation_id}"),
        ),
        RunError::UnknownProject { project_id } => (
            AppErrorCode::PermissionDenied,
            format!("unknown project: {project_id}"),
        ),
        RunError::ConversationProjectMismatch {
            conversation_id,
            project_id,
        } => (
            AppErrorCode::PermissionDenied,
            format!("conversation {conversation_id} does not belong to project {project_id}"),
        ),
        RunError::UnknownRun { run_id } => (
            AppErrorCode::PermissionDenied,
            format!("unknown run: {run_id}"),
        ),
        RunError::SelectionChain(selection) => {
            (AppErrorCode::ValidationFailed, selection_message(selection))
        }
        RunError::EmptyRunId => (
            AppErrorCode::ValidationFailed,
            "runId must not be empty".to_owned(),
        ),
        RunError::RunIdTooLong { len } => (
            AppErrorCode::ValidationFailed,
            format!("runId exceeds the maximum accepted size ({len} bytes)"),
        ),
        RunError::EmptyPrompt => (
            AppErrorCode::ValidationFailed,
            "prompt must not be empty".to_owned(),
        ),
        RunError::PromptTooLong { len } => (
            AppErrorCode::ValidationFailed,
            format!("prompt exceeds the maximum accepted size ({len} bytes)"),
        ),
        RunError::EmptyGitBranch => (
            AppErrorCode::ValidationFailed,
            "environment.gitBranch must not be empty".to_owned(),
        ),
        RunError::GitBranchTooLong { len } => (
            AppErrorCode::ValidationFailed,
            format!("environment.gitBranch exceeds the maximum accepted size ({len} bytes)"),
        ),
        RunError::EnvironmentNameTooLong { len } => (
            AppErrorCode::ValidationFailed,
            format!("environment.environmentName exceeds the maximum accepted size ({len} bytes)"),
        ),
    };
    AppErrorDto::new(code, message, request_id())
}

fn invalid_field(field: &str) -> AppErrorDto {
    AppErrorDto::new(
        AppErrorCode::ValidationFailed,
        format!("{field} is not a valid id"),
        request_id(),
    )
}

fn parse_start_spec(request: StartRunRequestDto) -> Result<StartRunSpec, AppErrorDto> {
    let conversation_id = ConversationId::new(request.conversation_id)
        .map_err(|_| invalid_field("conversationId"))?;
    let project_id = ProjectId::new(request.project_id).map_err(|_| invalid_field("projectId"))?;
    let provider_id = ProviderId::new(request.provider_id)
        .map_err(|error| run_error(RunError::SelectionChain(error)))?;
    let model_id = ModelId::new(request.model_id)
        .map_err(|error| run_error(RunError::SelectionChain(error)))?;
    let effort_level = EffortLevel::new(request.effort_level)
        .map_err(|error| run_error(RunError::SelectionChain(error)))?;
    let prompt = RunPrompt::new(request.prompt).map_err(run_error)?;
    let environment = RunEnvironment::new(
        request.environment.use_new_worktree,
        request.environment.git_branch,
        request.environment.environment_name,
    )
    .map_err(run_error)?;
    Ok(StartRunSpec {
        conversation_id,
        project_id,
        provider_id,
        model_id,
        effort_level,
        prompt,
        environment,
    })
}

fn to_run_dto(snapshot: RunSnapshot) -> RunDto {
    RunDto {
        run_id: snapshot.run_id,
        conversation_id: snapshot.conversation_id,
        project_id: snapshot.project_id,
        status: match snapshot.status {
            RunStatus::Pending => RunStatusDto::Pending,
            RunStatus::Streaming => RunStatusDto::Streaming,
            RunStatus::Completed => RunStatusDto::Completed,
            RunStatus::Failed => RunStatusDto::Failed,
            RunStatus::Cancelled => RunStatusDto::Cancelled,
        },
    }
}

fn failure_error(failure: RunFailure) -> AppErrorDto {
    let code = match failure.code {
        RunFailureCode::ProviderUnavailable => AppErrorCode::ProviderUnavailable,
        RunFailureCode::Internal => AppErrorCode::InternalError,
        RunFailureCode::Cancelled => AppErrorCode::Cancelled,
    };
    AppErrorDto::new(code, failure.message, request_id())
}

/// Projects a sequenced domain frame onto the frozen six-kind wire union.
fn to_stream_event_dto(frame: RunFrame) -> RunStreamEventDto {
    let run_id = frame.run_id;
    let seq = frame.seq;
    match frame.event {
        RunEvent::Started => RunStreamEventDto::Started { run_id, seq },
        RunEvent::TextDelta { text } => RunStreamEventDto::TextDelta { run_id, seq, text },
        RunEvent::ToolActivity { tool_call } => RunStreamEventDto::ToolActivity {
            run_id,
            seq,
            tool_call: to_tool_call_dto(&tool_call),
        },
        RunEvent::Completed => RunStreamEventDto::Completed { run_id, seq },
        RunEvent::Failed { failure } => RunStreamEventDto::Failed {
            run_id,
            seq,
            error: failure_error(failure),
        },
        RunEvent::Cancelled => RunStreamEventDto::Cancelled { run_id, seq },
    }
}

/// Adapts the supervisor's domain sink to the Tauri channel.
struct ChannelRunSink {
    channel: Channel<RunStreamEventDto>,
}

impl RunEventSink for ChannelRunSink {
    fn emit(&self, frame: RunFrame) {
        // A failed send means the webview or its handler is gone. The run
        // continues in the core and `get_run` remains authoritative on reopen.
        let _ = self.channel.send(to_stream_event_dto(frame));
    }
}

/// Starts a run and streams its frames through the caller's channel.
///
/// Resolves the initial `pending` snapshot; `started` and the rest of the
/// lifecycle arrive through `onEvent`, which the client binds before invoking.
#[tauri::command]
pub fn start_run(
    supervisor: State<'_, RunSupervisor>,
    conversations: State<'_, ConversationStore>,
    projects: State<'_, ProjectStore>,
    registry: State<'_, ProviderRegistry>,
    request: StartRunRequestDto,
    on_event: Channel<RunStreamEventDto>,
) -> Result<RunDto, AppErrorDto> {
    let spec = parse_start_spec(request)?;
    let sink: Arc<dyn RunEventSink> = Arc::new(ChannelRunSink { channel: on_event });
    let started = service::start_run(
        &supervisor,
        &conversations,
        &projects,
        &registry,
        spec,
        sink,
    )
    .map_err(run_error)?;
    tauri::async_runtime::spawn(started.driver);
    Ok(to_run_dto(started.snapshot))
}

/// Cancels a run and resolves its authoritative terminal snapshot.
///
/// Idempotent: cancelling a terminal run returns that terminal snapshot and
/// emits no second frame; an unknown id is denied authority.
#[tauri::command]
pub fn cancel_run(
    supervisor: State<'_, RunSupervisor>,
    request: CancelRunRequestDto,
) -> Result<RunDto, AppErrorDto> {
    let run_id = RunId::new(request.run_id).map_err(run_error)?;
    let snapshot = supervisor.cancel(&run_id).ok_or_else(|| {
        run_error(RunError::UnknownRun {
            run_id: run_id.as_str().to_owned(),
        })
    })?;
    Ok(to_run_dto(snapshot))
}

/// Reads the authoritative run snapshot; used when a panel reopens.
#[tauri::command]
pub fn get_run(
    supervisor: State<'_, RunSupervisor>,
    request: GetRunRequestDto,
) -> Result<RunDto, AppErrorDto> {
    let run_id = RunId::new(request.run_id).map_err(run_error)?;
    let snapshot = supervisor.snapshot(&run_id).ok_or_else(|| {
        run_error(RunError::UnknownRun {
            run_id: run_id.as_str().to_owned(),
        })
    })?;
    Ok(to_run_dto(snapshot))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::conversations::domain::{ToolCall, ToolCallKind, ToolCallStatus};
    use crate::ipc::error::AppErrorCode;

    fn fixture(name: &str) -> serde_json::Value {
        let raw = match name {
            "runs-start-run.json" => {
                include_str!("../../../../docs/ipc/fixtures/runs-start-run.json")
            }
            "runs-cancel-run.json" => {
                include_str!("../../../../docs/ipc/fixtures/runs-cancel-run.json")
            }
            "runs-get-run.json" => include_str!("../../../../docs/ipc/fixtures/runs-get-run.json"),
            "runs-stream-events.json" => {
                include_str!("../../../../docs/ipc/fixtures/runs-stream-events.json")
            }
            other => panic!("unknown fixture: {other}"),
        };
        serde_json::from_str(raw).expect("fixture parses")
    }

    fn start_request() -> StartRunRequestDto {
        serde_json::from_value(fixture("runs-start-run.json")["request"].clone())
            .expect("start request deserializes")
    }

    fn frame(seq: u64, event: RunEvent) -> RunFrame {
        RunFrame {
            run_id: "run-7f2a9c10".to_owned(),
            seq,
            event,
        }
    }

    #[test]
    fn parses_the_pinned_start_request() {
        let spec = parse_start_spec(start_request()).expect("request validates");
        assert_eq!(spec.conversation_id.as_str(), "conv-composer-chain");
        assert_eq!(spec.project_id.as_str(), "proj-design-system");
        assert_eq!(spec.provider_id.as_str(), "opencode");
        assert_eq!(spec.model_id.as_str(), "deepseek-v3.1");
        assert_eq!(spec.effort_level.as_str(), "high");
        assert_eq!(
            spec.prompt.as_str(),
            "Reconcile the provider, model, and effort selectors."
        );
        assert!(!spec.environment.use_new_worktree());
        assert_eq!(spec.environment.git_branch(), "main");
        assert_eq!(spec.environment.environment_name(), "local");
    }

    #[test]
    fn rejects_a_blank_prompt_at_the_limits_tier() {
        let mut request = start_request();
        request.prompt = "   ".to_owned();
        let error = parse_start_spec(request).expect_err("blank prompt");
        assert_eq!(error.code, AppErrorCode::ValidationFailed);
        assert!(!error.retryable);
    }

    #[test]
    fn start_response_keeps_the_pinned_shape() {
        let expected: RunDto =
            serde_json::from_value(fixture("runs-start-run.json")["response"].clone())
                .expect("response deserializes");
        let dto = to_run_dto(RunSnapshot {
            run_id: expected.run_id.clone(),
            conversation_id: expected.conversation_id.clone(),
            project_id: expected.project_id.clone(),
            status: RunStatus::Pending,
        });
        assert_eq!(dto, expected);
    }

    #[test]
    fn terminal_snapshots_keep_the_pinned_shapes() {
        let cancel: RunDto =
            serde_json::from_value(fixture("runs-cancel-run.json")["response"].clone())
                .expect("cancel response deserializes");
        assert_eq!(
            to_run_dto(RunSnapshot {
                run_id: cancel.run_id.clone(),
                conversation_id: cancel.conversation_id.clone(),
                project_id: cancel.project_id.clone(),
                status: RunStatus::Cancelled,
            }),
            cancel
        );

        let get: RunDto = serde_json::from_value(fixture("runs-get-run.json")["response"].clone())
            .expect("get response deserializes");
        assert_eq!(
            to_run_dto(RunSnapshot {
                run_id: get.run_id.clone(),
                conversation_id: get.conversation_id.clone(),
                project_id: get.project_id.clone(),
                status: RunStatus::Streaming,
            }),
            get
        );
    }

    #[test]
    fn stream_frames_match_the_pinned_union() {
        let events = fixture("runs-stream-events.json")["events"].clone();

        assert_eq!(
            serde_json::to_value(to_stream_event_dto(frame(1, RunEvent::Started)))
                .expect("started serializes"),
            events["started"]
        );
        assert_eq!(
            serde_json::to_value(to_stream_event_dto(frame(
                2,
                RunEvent::TextDelta {
                    text: "Reconciling the provider, model, and effort selectors.".to_owned(),
                },
            )))
            .expect("text delta serializes"),
            events["textDelta"]
        );
        assert_eq!(
            serde_json::to_value(to_stream_event_dto(frame(
                3,
                RunEvent::ToolActivity {
                    tool_call: ToolCall {
                        id: "tool-run-1".to_owned(),
                        kind: ToolCallKind::Search,
                        summary: "Searched src for the selection chain".to_owned(),
                        detail: "Matched selection-chain.ts and the composer organisms.".to_owned(),
                        status: ToolCallStatus::Completed,
                        subagent_id: None,
                    },
                },
            )))
            .expect("tool activity serializes"),
            events["toolActivity"]
        );
        assert_eq!(
            serde_json::to_value(to_stream_event_dto(frame(4, RunEvent::Completed)))
                .expect("completed serializes"),
            events["completed"]
        );
        assert_eq!(
            serde_json::to_value(to_stream_event_dto(frame(5, RunEvent::Cancelled)))
                .expect("cancelled serializes"),
            events["cancelled"]
        );
    }

    #[test]
    fn failed_frame_carries_the_public_error_contract() {
        let value = serde_json::to_value(to_stream_event_dto(frame(
            5,
            RunEvent::Failed {
                failure: RunFailure::provider_unavailable(
                    "provider adapter did not respond before the timeout",
                ),
            },
        )))
        .expect("failed frame serializes");

        assert_eq!(value["kind"], "failed");
        assert_eq!(value["runId"], "run-7f2a9c10");
        assert_eq!(value["seq"], 5);
        assert_eq!(value["error"]["code"], "provider_unavailable");
        assert_eq!(
            value["error"]["message"],
            "provider adapter did not respond before the timeout"
        );
        assert_eq!(value["error"]["retryable"], true);
        assert!(
            value["error"]["requestId"]
                .as_str()
                .unwrap_or_default()
                .starts_with("req-")
        );
    }

    #[test]
    fn unknown_runs_are_denied_authority() {
        let error = run_error(RunError::UnknownRun {
            run_id: "run-ghost".to_owned(),
        });
        assert_eq!(error.code, AppErrorCode::PermissionDenied);
        assert!(!error.retryable);
        assert!(error.request_id.starts_with("req-"));
    }

    #[test]
    fn limits_failures_are_validation_errors() {
        let error = run_error(RunError::PromptTooLong { len: 70_000 });
        assert_eq!(error.code, AppErrorCode::ValidationFailed);
        assert!(error.message.contains("prompt"));
    }

    #[test]
    fn parent_mismatch_is_denied_authority() {
        let error = run_error(RunError::ConversationProjectMismatch {
            conversation_id: "conv-composer-chain".to_owned(),
            project_id: "proj-api-client".to_owned(),
        });
        assert_eq!(error.code, AppErrorCode::PermissionDenied);
    }
}
