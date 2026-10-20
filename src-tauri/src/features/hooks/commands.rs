//! Hook review commands (issue #20).
//!
//! Thin input adapters: validate the boundary (Shape via Serde, Limits via the
//! domain constructors, Invariants/Authority via [`HookService`]), invoke the
//! use case and map failures to [`AppErrorDto`]. No provider configuration and
//! no process execution live here.

use std::sync::atomic::{AtomicU64, Ordering};

use tauri::State;

use super::domain::{HookError, HookId, ReviewedHook};
use super::dto::{HookDto, ListHooksRequestDto, SetHookDecisionRequestDto};
use super::service::HookService;
use crate::features::projects::domain::ProjectId;
use crate::features::projects::dto::{from_hook_approval_status_dto, to_hook_approval_status_dto};
use crate::features::projects::service::ProjectStore;
use crate::ipc::error::{AppErrorCode, AppErrorDto};

/// Monotonic suffix for command correlation ids (`req-<n>`).
static REQUEST_SEQ: AtomicU64 = AtomicU64::new(1);

fn request_id() -> String {
    format!("req-{}", REQUEST_SEQ.fetch_add(1, Ordering::Relaxed))
}

fn invalid_project_id() -> AppErrorDto {
    AppErrorDto::new(
        AppErrorCode::ValidationFailed,
        "projectId is not a valid id".to_owned(),
        request_id(),
    )
}

fn invalid_hook_id(error: HookError) -> AppErrorDto {
    let message = match &error {
        HookError::EmptyHookId => "hookId must not be empty".to_owned(),
        HookError::HookIdTooLong { len } => {
            format!("hookId exceeds the maximum accepted size ({len} bytes)")
        }
        _ => "hookId is not a valid id".to_owned(),
    };
    AppErrorDto::new(AppErrorCode::ValidationFailed, message, request_id())
}

fn hook_error(error: HookError) -> AppErrorDto {
    let (code, message) = match &error {
        HookError::UnknownProject { project_id } => (
            AppErrorCode::PermissionDenied,
            format!("unknown project: {project_id}"),
        ),
        HookError::UnknownHook { hook_id } => (
            AppErrorCode::PermissionDenied,
            format!("unknown hook: {hook_id}"),
        ),
        HookError::ProjectHasNoWorkspace { project_id } => (
            AppErrorCode::PermissionDenied,
            format!("project has no authorized workspace root: {project_id}"),
        ),
        HookError::WorkspaceNotAuthorized { folder } => (
            AppErrorCode::PermissionDenied,
            format!("workspace folder is not authorized: {folder}"),
        ),
        // Provider-data and execution failures have no caller-actionable shape;
        // they are internal rather than blaming the request.
        HookError::EmptyHookId
        | HookError::HookIdTooLong { .. }
        | HookError::EmptyName
        | HookError::NameTooLong { .. }
        | HookError::EmptyOrigin
        | HookError::OriginTooLong { .. }
        | HookError::EmptyHookType
        | HookError::HookTypeTooLong { .. }
        | HookError::EmptyCommand
        | HookError::CommandTooLong { .. }
        | HookError::InvalidTimeout { .. }
        | HookError::TooManyHooks { .. }
        | HookError::DuplicateHookId { .. }
        | HookError::InvalidCommand { .. }
        | HookError::HookExecutionFailed { .. } => (
            AppErrorCode::InternalError,
            "provider hook configuration is not valid".to_owned(),
        ),
    };
    AppErrorDto::new(code, message, request_id())
}

fn to_hook_dto(hook: &ReviewedHook) -> HookDto {
    HookDto {
        id: hook.definition.id.as_str().to_owned(),
        name: hook.definition.name.clone(),
        is_new: hook.definition.is_new,
        origin: hook.definition.origin.clone(),
        hook_type: hook.definition.hook_type.clone(),
        command: hook.definition.command.clone(),
        timeout_ms: hook.definition.timeout_ms,
        approval_status: to_hook_approval_status_dto(hook.approval_status),
    }
}

/// Lists one project's hooks with its decisions applied.
#[tauri::command]
pub fn list_hooks(
    hooks: State<'_, HookService>,
    projects: State<'_, ProjectStore>,
    request: ListHooksRequestDto,
) -> Result<Vec<HookDto>, AppErrorDto> {
    let project_id = ProjectId::new(request.project_id).map_err(|_| invalid_project_id())?;
    let hooks = hooks
        .list_hooks(&projects, &project_id)
        .map_err(hook_error)?;
    Ok(hooks.iter().map(to_hook_dto).collect())
}

/// Records one project-scoped hook decision and returns the updated hook.
#[tauri::command]
pub fn set_hook_decision(
    hooks: State<'_, HookService>,
    projects: State<'_, ProjectStore>,
    request: SetHookDecisionRequestDto,
) -> Result<HookDto, AppErrorDto> {
    let project_id = ProjectId::new(request.project_id).map_err(|_| invalid_project_id())?;
    let hook_id = HookId::new(request.hook_id).map_err(invalid_hook_id)?;
    let approval_status = from_hook_approval_status_dto(request.approval_status);
    let hook = hooks
        .set_hook_decision(&projects, &project_id, &hook_id, approval_status)
        .map_err(hook_error)?;
    Ok(to_hook_dto(&hook))
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::super::adapters::fake::FakeHookSource;
    use super::*;
    use crate::features::projects::domain::HookApprovalStatus;

    fn fixture(name: &str) -> serde_json::Value {
        let raw = match name {
            "hooks-list-hooks.json" => {
                include_str!("../../../../docs/ipc/fixtures/hooks-list-hooks.json")
            }
            "hooks-set-hook-decision.json" => {
                include_str!("../../../../docs/ipc/fixtures/hooks-set-hook-decision.json")
            }
            other => panic!("unknown fixture: {other}"),
        };
        serde_json::from_str(raw).expect("fixture parses")
    }

    fn service() -> HookService {
        HookService::new(Arc::new(FakeHookSource))
    }

    fn design_system() -> ProjectId {
        ProjectId::new("proj-design-system").expect("fixture id")
    }

    #[test]
    fn list_output_matches_the_pinned_fixture() {
        let expected: Vec<HookDto> =
            serde_json::from_value(fixture("hooks-list-hooks.json")["response"].clone())
                .expect("hooks response deserializes");
        let projects = ProjectStore::seeded();
        let hooks = service()
            .list_hooks(&projects, &design_system())
            .expect("known project");
        let actual: Vec<HookDto> = hooks.iter().map(to_hook_dto).collect();
        assert_eq!(actual, expected);
    }

    #[test]
    fn decision_output_matches_the_pinned_fixture() {
        let expected: HookDto =
            serde_json::from_value(fixture("hooks-set-hook-decision.json")["response"].clone())
                .expect("decision response deserializes");
        let projects = ProjectStore::seeded();
        let hook = service()
            .set_hook_decision(
                &projects,
                &design_system(),
                &HookId::new("hook-lint-on-write").expect("fixture id"),
                HookApprovalStatus::Rejected,
            )
            .expect("known hook");
        assert_eq!(to_hook_dto(&hook), expected);
    }

    #[test]
    fn unknown_projects_are_denied_authority() {
        let error = hook_error(HookError::UnknownProject {
            project_id: "proj-ghost".to_owned(),
        });
        assert_eq!(error.code, AppErrorCode::PermissionDenied);
        assert!(!error.retryable);
        assert!(error.request_id.starts_with("req-"));
    }

    #[test]
    fn unknown_hooks_are_denied_authority() {
        let error = hook_error(HookError::UnknownHook {
            hook_id: "hook-ghost".to_owned(),
        });
        assert_eq!(error.code, AppErrorCode::PermissionDenied);
    }

    #[test]
    fn an_invalid_hook_id_is_a_validation_error() {
        let error = invalid_hook_id(HookError::EmptyHookId);
        assert_eq!(error.code, AppErrorCode::ValidationFailed);
        assert!(error.message.contains("hookId"));
    }

    #[test]
    fn provider_data_failures_are_internal_errors() {
        let error = hook_error(HookError::DuplicateHookId {
            hook_id: "hook-lint-on-write".to_owned(),
        });
        assert_eq!(error.code, AppErrorCode::InternalError);
        assert!(error.retryable);
    }
}
