//! Workspace read command (issue #21).
//!
//! Thin input adapter: validates the request ids, delegates to the read use
//! case and maps failures to [`AppErrorDto`]. No filesystem logic lives here.

use std::sync::atomic::{AtomicU64, Ordering};

use tauri::State;

use super::domain::{FileDocument, WorkspaceError};
use super::dto::{FileDocumentDto, ReadFileRequestDto};
use super::service;
use crate::features::projects::domain::ProjectId;
use crate::features::projects::service::ProjectStore;
use crate::ipc::error::{AppErrorCode, AppErrorDto};

/// Monotonic suffix for command correlation ids (`req-<n>`).
static REQUEST_SEQ: AtomicU64 = AtomicU64::new(1);

fn request_id() -> String {
    format!("req-{}", REQUEST_SEQ.fetch_add(1, Ordering::Relaxed))
}

fn validation_error(message: &str) -> AppErrorDto {
    AppErrorDto::new(
        AppErrorCode::ValidationFailed,
        message.to_owned(),
        request_id(),
    )
}

fn workspace_error(error: WorkspaceError) -> AppErrorDto {
    let (code, message) = match &error {
        WorkspaceError::UnknownProject { project_id } => (
            AppErrorCode::PermissionDenied,
            format!("unknown project: {project_id}"),
        ),
        WorkspaceError::PathDenied { path } => (
            AppErrorCode::PermissionDenied,
            format!("path is outside the authorized workspace root: {path}"),
        ),
        WorkspaceError::OsPermissionDenied => (
            AppErrorCode::PermissionDenied,
            "the operating system denied access to the file".to_owned(),
        ),
        WorkspaceError::InvalidPath { path } => (
            AppErrorCode::ValidationFailed,
            format!("path is not a valid workspace path: {path}"),
        ),
        WorkspaceError::FileTooLarge { len } => (
            AppErrorCode::ValidationFailed,
            format!("file exceeds the maximum accepted size ({len} bytes)"),
        ),
        WorkspaceError::ReadFailed => (
            AppErrorCode::InternalError,
            "the workspace file could not be read".to_owned(),
        ),
    };
    AppErrorDto::new(code, message, request_id())
}

fn to_file_document_dto(document: FileDocument) -> FileDocumentDto {
    FileDocumentDto {
        path: document.path,
        content: document.content,
    }
}

/// Reads one workspace-relative file; `null` means the path holds no document.
#[tauri::command]
pub async fn read_file(
    projects: State<'_, ProjectStore>,
    request: ReadFileRequestDto,
) -> Result<Option<FileDocumentDto>, AppErrorDto> {
    let project_id = ProjectId::new(request.project_id)
        .map_err(|_| validation_error("projectId is not a valid id"))?;
    let document = service::read_file(&projects, &project_id, &request.path)
        .await
        .map_err(workspace_error)?;
    Ok(document.map(to_file_document_dto))
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;

    use super::*;
    use crate::features::projects::domain::{ApprovalMode, Project};

    fn temp_workspace(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "nx-workspace-command-{name}-{}",
            std::process::id()
        ));
        if root.exists() {
            fs::remove_dir_all(&root).expect("scratch workspace resets");
        }
        fs::create_dir_all(&root).expect("scratch workspace exists");
        root
    }

    fn store_with_root(root: &std::path::Path) -> ProjectStore {
        ProjectStore::from_projects(vec![Project {
            id: ProjectId::new("proj-design-system").expect("fixture id"),
            name: "Design system".to_owned(),
            workspace_folders: vec![root.to_string_lossy().into_owned()],
            approval_mode: ApprovalMode::AskAlways,
            hook_decisions: Vec::new(),
            conversation_ids: Vec::new(),
        }])
    }

    #[tokio::test]
    async fn output_matches_the_pinned_fixture() {
        let raw = include_str!("../../../../docs/ipc/fixtures/workspace-read-file.json");
        let fixture: serde_json::Value =
            serde_json::from_str(raw).expect("workspace fixture parses");
        let expected: FileDocumentDto = serde_json::from_value(fixture["response"].clone())
            .expect("fixture response deserializes");

        let root = temp_workspace("fixture");
        let file_path = root.join("docs/research-tecnico/arquitectura-tauri.md");
        fs::create_dir_all(file_path.parent().expect("fixture parent")).expect("fixture directory");
        fs::write(&file_path, &expected.content).expect("fixture file");
        let store = store_with_root(&root);

        let document = service::read_file(
            &store,
            &ProjectId::new("proj-design-system").expect("fixture id"),
            &expected.path,
        )
        .await
        .expect("read succeeds")
        .expect("document exists");
        assert_eq!(to_file_document_dto(document), expected);

        fs::remove_dir_all(&root).expect("scratch cleanup");
    }

    #[test]
    fn authority_failures_carry_permission_denied() {
        let denied = workspace_error(WorkspaceError::PathDenied {
            path: "../secret".to_owned(),
        });
        assert_eq!(denied.code, AppErrorCode::PermissionDenied);
        assert!(!denied.retryable);

        let unknown = workspace_error(WorkspaceError::UnknownProject {
            project_id: "proj-ghost".to_owned(),
        });
        assert_eq!(unknown.code, AppErrorCode::PermissionDenied);
    }

    #[test]
    fn limits_failures_carry_validation_failed() {
        let error = workspace_error(WorkspaceError::FileTooLarge { len: 3_000_000 });
        assert_eq!(error.code, AppErrorCode::ValidationFailed);
        assert!(error.message.contains("maximum accepted size"));
        assert!(error.request_id.starts_with("req-"));
    }
}
