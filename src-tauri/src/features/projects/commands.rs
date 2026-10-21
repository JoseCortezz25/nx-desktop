//! Project catalog commands (issue #18).
//!
//! Thin input adapters: validate the boundary (Shape via Serde, Limits via the
//! domain constructors, Invariants and Authority via the store), invoke the
//! use case, and map failures to [`AppErrorDto`]. No business rules and no
//! filesystem logic live here.

use std::sync::atomic::{AtomicU64, Ordering};

use tauri::State;
use tauri_plugin_dialog::DialogExt;

use super::domain::{
    ApprovalMode, PickedWorkspaceFolder, Project, ProjectError, ProjectId, ProjectName,
};
use super::dto::{
    ApprovalModeDto, CreateProjectRequestDto, CreatedProjectDto, HookDecisionDto,
    ListWorkspaceBranchesRequestDto, PickedWorkspaceFolderDto, ProjectDto,
    SetProjectApprovalModeRequestDto, to_hook_approval_status_dto,
};
use super::service::{ProjectStore, describe_picked_folder};
use crate::ipc::error::{AppErrorCode, AppErrorDto};

/// Monotonic suffix for command correlation ids (`req-<n>`).
static REQUEST_SEQ: AtomicU64 = AtomicU64::new(1);

fn request_id() -> String {
    format!("req-{}", REQUEST_SEQ.fetch_add(1, Ordering::Relaxed))
}

/// Builds an error with the caller-supplied request id (so tests pin it).
#[cfg(test)]
fn error_with_id(code: AppErrorCode, message: String, id: String) -> AppErrorDto {
    AppErrorDto {
        code,
        message,
        retryable: code.is_retryable(),
        request_id: id,
    }
}

fn validation_error(error: ProjectError) -> AppErrorDto {
    let message = match &error {
        ProjectError::EmptyProjectId => "projectId must not be empty".to_owned(),
        ProjectError::IdTooLong { len } => {
            format!("projectId exceeds the maximum accepted size ({len} bytes)")
        }
        ProjectError::EmptyName => "name must not be empty".to_owned(),
        ProjectError::NameTooLong { len } => {
            format!("name exceeds the maximum accepted size ({len} bytes)")
        }
        ProjectError::NoFolders => "folders must hold at least one workspace root".to_owned(),
        ProjectError::TooManyFolders { len } => {
            format!("folders exceeds the maximum project roots ({len} supplied)")
        }
        ProjectError::EmptyFolder => "folders must not hold an empty path".to_owned(),
        ProjectError::FolderTooLong { len } => {
            format!("folder exceeds the maximum accepted size ({len} bytes)")
        }
        ProjectError::FolderNotAuthorized { folder } => {
            format!("folder is not an authorized workspace root: {folder}")
        }
        ProjectError::FolderNotFound { folder } => format!("folder does not exist: {folder}"),
        ProjectError::FolderNotDirectory { folder } => {
            format!("folder is not a directory: {folder}")
        }
        ProjectError::DuplicateFolder { folder } => {
            format!("folder is already part of the project: {folder}")
        }
        // Unreachable from the validation-only paths below; kept so the match
        // stays exhaustive over the domain error.
        ProjectError::UnknownProject { project_id } => format!("unknown project: {project_id}"),
        ProjectError::PersistenceFailed => "project could not be persisted".to_owned(),
    };
    AppErrorDto::new(AppErrorCode::ValidationFailed, message, request_id())
}

fn internal_error(message: &str) -> AppErrorDto {
    AppErrorDto::new(
        AppErrorCode::InternalError,
        message.to_owned(),
        request_id(),
    )
}

fn authority_error(error: ProjectError) -> AppErrorDto {
    let message = match &error {
        ProjectError::UnknownProject { project_id } => format!("unknown project: {project_id}"),
        ProjectError::FolderNotAuthorized { folder } => {
            format!("folder is not an authorized workspace root: {folder}")
        }
        // Validation-tier failures never reach this mapper; the message keeps
        // the match exhaustive without inventing a wire shape.
        other => validation_error(other.clone()).message,
    };
    AppErrorDto::new(AppErrorCode::PermissionDenied, message, request_id())
}

fn to_hook_decision_dto(decision: &super::domain::HookDecision) -> HookDecisionDto {
    HookDecisionDto {
        hook_id: decision.hook_id.clone(),
        approval_status: to_hook_approval_status_dto(decision.approval_status),
    }
}

fn to_project_dto(project: &Project) -> ProjectDto {
    ProjectDto {
        id: project.id.as_str().to_owned(),
        name: project.name.clone(),
        workspace_folders: project.workspace_folders.clone(),
        approval_mode: match project.approval_mode {
            ApprovalMode::AskAlways => ApprovalModeDto::AskAlways,
            ApprovalMode::AutoApprove => ApprovalModeDto::AutoApprove,
            ApprovalMode::FullAccess => ApprovalModeDto::FullAccess,
        },
        hook_decisions: project
            .hook_decisions
            .iter()
            .map(to_hook_decision_dto)
            .collect(),
        conversation_ids: project.conversation_ids.clone(),
    }
}

fn to_picked_workspace_folder_dto(folder: PickedWorkspaceFolder) -> PickedWorkspaceFolderDto {
    PickedWorkspaceFolderDto {
        path: folder.path,
        label: folder.label,
    }
}

/// Maps a folder refusal: a relative folder is denied authority, every other
/// folder problem is a malformed request (`validation_failed`).
fn folder_error(error: ProjectError) -> AppErrorDto {
    match &error {
        ProjectError::FolderNotAuthorized { .. } => authority_error(error),
        ProjectError::PersistenceFailed => internal_error("project could not be persisted"),
        _ => validation_error(error),
    }
}

/// Opens the native folder dialog from Rust and returns the chosen folder, or
/// `None` when the user cancels (issue #147).
///
/// The dialog plugin is driven only from here: the webview holds no dialog
/// permission, so it can ask for a folder but never open arbitrary dialogs or
/// choose what the result means. The returned folder is canonical, and
/// `create_project` re-validates it anyway because the webview echoes it back.
#[tauri::command]
pub async fn pick_workspace_folder(
    window: tauri::WebviewWindow,
) -> Result<Option<PickedWorkspaceFolderDto>, AppErrorDto> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let builder = window.dialog().file();
    #[cfg(desktop)]
    let builder = builder.set_parent(&window);
    builder.pick_folder(move |picked| {
        // The receiver only disappears if the command future was dropped, in
        // which case nobody is waiting for the answer.
        let _ = sender.send(picked);
    });
    let picked = receiver
        .await
        .map_err(|_| internal_error("folder dialog ended without an answer"))?;
    let Some(picked) = picked else {
        return Ok(None);
    };
    let path = picked
        .into_path()
        .map_err(|_| internal_error("folder dialog returned a non-filesystem location"))?;
    describe_picked_folder(&path)
        .map(|folder| Some(to_picked_workspace_folder_dto(folder)))
        .map_err(folder_error)
}

/// Lists every persisted project.
#[tauri::command]
pub fn list_projects(store: State<'_, ProjectStore>) -> Result<Vec<ProjectDto>, AppErrorDto> {
    Ok(store.list_projects().iter().map(to_project_dto).collect())
}

/// Creates one project from its name and folders; the core decides the id and
/// defaults. A refused folder is denied authority, not a malformed request.
#[tauri::command]
pub fn create_project(
    store: State<'_, ProjectStore>,
    request: CreateProjectRequestDto,
) -> Result<CreatedProjectDto, AppErrorDto> {
    let name = ProjectName::new(request.name).map_err(validation_error)?;
    let (project, projects) = store
        .create_project(&name, &request.folders)
        .map_err(folder_error)?;
    Ok(CreatedProjectDto {
        project: to_project_dto(&project),
        projects: projects.iter().map(to_project_dto).collect(),
    })
}

/// Persists one project's approval policy; an unknown id is denied authority.
#[tauri::command]
pub fn set_project_approval_mode(
    store: State<'_, ProjectStore>,
    request: SetProjectApprovalModeRequestDto,
) -> Result<Vec<ProjectDto>, AppErrorDto> {
    let id = ProjectId::new(request.project_id).map_err(validation_error)?;
    let mode = match request.approval_mode {
        ApprovalModeDto::AskAlways => ApprovalMode::AskAlways,
        ApprovalModeDto::AutoApprove => ApprovalMode::AutoApprove,
        ApprovalModeDto::FullAccess => ApprovalMode::FullAccess,
    };
    let projects = store
        .set_approval_mode(&id, mode)
        .map_err(|error| match &error {
            ProjectError::PersistenceFailed => internal_error("project could not be persisted"),
            _ => authority_error(error),
        })?;
    Ok(projects.iter().map(to_project_dto).collect())
}

/// Lists one project's workspace branches; an unknown id is denied authority.
#[tauri::command]
pub fn list_workspace_branches(
    store: State<'_, ProjectStore>,
    request: ListWorkspaceBranchesRequestDto,
) -> Result<Vec<String>, AppErrorDto> {
    let id = ProjectId::new(request.project_id).map_err(validation_error)?;
    store.list_branches(&id).map_err(authority_error)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> ProjectStore {
        ProjectStore::seeded()
    }

    #[test]
    fn registry_output_matches_the_pinned_fixture() {
        let raw = include_str!("../../../../docs/ipc/fixtures/projects-list-projects.json");
        // Fixture file is valid JSON; a parse failure means the contract moved.
        let fixture: serde_json::Value = serde_json::from_str(raw).expect("project fixture parses");
        let expected: Vec<ProjectDto> = serde_json::from_value(fixture["response"].clone())
            .expect("fixture response deserializes");
        let actual: Vec<ProjectDto> = store().list_projects().iter().map(to_project_dto).collect();
        assert_eq!(actual, expected);
    }

    #[test]
    fn created_project_matches_the_pinned_fixture() {
        let raw = include_str!("../../../../docs/ipc/fixtures/projects-create-project.json");
        let fixture: serde_json::Value =
            serde_json::from_str(raw).expect("creation fixture parses");
        let expected: CreatedProjectDto = serde_json::from_value(fixture["response"].clone())
            .expect("fixture response deserializes");
        // The fixture models a single-project catalog: the created row joins
        // only `proj-design-system`, unlike the seeded two-project store.
        let seeded = store();
        let design_system = seeded
            .list_projects()
            .into_iter()
            .find(|project| project.id.as_str() == "proj-design-system")
            .expect("seed holds the design system project");
        let single = ProjectStore::from_projects(vec![design_system]);
        let name = ProjectName::new("Docs site").expect("name");
        // Folders must exist since #147, so a real scratch folder stands in for
        // the fixture's `/workspace/docs-site` and is swapped back before the
        // comparison; the rest of the wire shape is pinned byte for byte.
        let folder = scratch_folder("fixture");
        let (project, projects) = single
            .create_project(&name, std::slice::from_ref(&folder))
            .expect("creation succeeds");
        let pin = |dto: ProjectDto| ProjectDto {
            workspace_folders: dto
                .workspace_folders
                .into_iter()
                .map(|root| {
                    if root == folder {
                        "/workspace/docs-site".to_owned()
                    } else {
                        root
                    }
                })
                .collect(),
            ..dto
        };
        assert_eq!(
            CreatedProjectDto {
                project: pin(to_project_dto(&project)),
                projects: projects.iter().map(to_project_dto).map(pin).collect(),
            },
            expected
        );
    }

    /// A fresh scratch folder under the OS temp dir, as its canonical string.
    fn scratch_folder(name: &str) -> String {
        let root =
            std::env::temp_dir().join(format!("nx-project-commands-{name}-{}", std::process::id()));
        if root.exists() {
            std::fs::remove_dir_all(&root).expect("scratch folder resets");
        }
        std::fs::create_dir_all(&root).expect("scratch folder exists");
        std::fs::canonicalize(&root)
            .expect("scratch folder canonicalizes")
            .to_string_lossy()
            .into_owned()
    }

    #[test]
    fn picked_folder_matches_the_pinned_fixture() {
        let raw = include_str!("../../../../docs/ipc/fixtures/projects-pick-workspace-folder.json");
        let fixture: serde_json::Value = serde_json::from_str(raw).expect("picker fixture parses");
        let picked = to_picked_workspace_folder_dto(PickedWorkspaceFolder {
            path: "/workspace/docs-site".to_owned(),
            label: "docs-site".to_owned(),
        });
        assert_eq!(
            serde_json::to_value(Some(picked)).expect("picked folder serializes"),
            fixture["response"]
        );
        let cancelled: Option<PickedWorkspaceFolderDto> = None;
        assert_eq!(
            serde_json::to_value(cancelled).expect("cancel serializes"),
            fixture["cancelledResponse"]
        );
    }

    #[test]
    fn folder_problems_are_validation_failures_and_relative_folders_are_denied() {
        for error in [
            ProjectError::FolderNotFound {
                folder: "/missing".to_owned(),
            },
            ProjectError::FolderNotDirectory {
                folder: "/file.txt".to_owned(),
            },
            ProjectError::DuplicateFolder {
                folder: "/dup".to_owned(),
            },
        ] {
            assert_eq!(folder_error(error).code, AppErrorCode::ValidationFailed);
        }
        let relative = folder_error(ProjectError::FolderNotAuthorized {
            folder: "relative".to_owned(),
        });
        assert_eq!(relative.code, AppErrorCode::PermissionDenied);
    }

    #[test]
    fn creating_with_a_missing_or_duplicate_folder_reports_validation_failed() {
        let store = store();
        let name = ProjectName::new("Docs site").expect("name");
        let folder = scratch_folder("rejects");
        let missing = format!("{folder}/missing");
        for folders in [vec![missing], vec![folder.clone(), folder.clone()]] {
            let error = store
                .create_project(&name, &folders)
                .map_err(folder_error)
                .expect_err("folder refused");
            assert_eq!(error.code, AppErrorCode::ValidationFailed);
        }
        assert_eq!(store.list_projects().len(), 2);
    }

    #[test]
    fn approval_mode_update_matches_the_pinned_fixture() {
        let raw =
            include_str!("../../../../docs/ipc/fixtures/projects-set-project-approval-mode.json");
        let fixture: serde_json::Value =
            serde_json::from_str(raw).expect("approval fixture parses");
        let expected: Vec<ProjectDto> = serde_json::from_value(fixture["response"].clone())
            .expect("fixture response deserializes");
        let id = ProjectId::new("proj-design-system").expect("id");
        let projects = store()
            .set_approval_mode(&id, ApprovalMode::FullAccess)
            .expect("known project");
        let actual: Vec<ProjectDto> = projects.iter().map(to_project_dto).collect();
        assert_eq!(actual, expected);
    }

    #[test]
    fn branch_list_matches_the_pinned_fixture() {
        let raw =
            include_str!("../../../../docs/ipc/fixtures/projects-list-workspace-branches.json");
        let fixture: serde_json::Value =
            serde_json::from_str(raw).expect("branches fixture parses");
        let expected: Vec<String> = serde_json::from_value(fixture["response"].clone())
            .expect("fixture response deserializes");
        let id = ProjectId::new("proj-design-system").expect("id");
        assert_eq!(store().list_branches(&id).expect("known project"), expected);
    }

    #[test]
    fn failures_carry_the_documented_codes() {
        let denied = authority_error(ProjectError::UnknownProject {
            project_id: "proj-ghost".to_owned(),
        });
        assert_eq!(denied.code, AppErrorCode::PermissionDenied);
        assert!(!denied.retryable);

        let invalid = error_with_id(
            AppErrorCode::ValidationFailed,
            "name must not be empty".to_owned(),
            "req-test".to_owned(),
        );
        assert_eq!(invalid.request_id, "req-test");
        assert!(!invalid.retryable);
    }
}
