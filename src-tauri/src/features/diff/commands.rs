//! Workspace diff command (issue #21).
//!
//! Thin input adapter: validates `projectId`, delegates to the diff use case
//! and maps the unified domain change set to the frozen wire shape. No git
//! process and no path logic live here.

use std::sync::atomic::{AtomicU64, Ordering};

use tauri::State;

use super::adapters::git::GitDiffSource;
use super::domain::{DiffError, DiffFile, DiffHunk, DiffLine, DiffLineKind};
use super::dto::{
    DiffFileDto, DiffHunkDto, DiffLineDto, DiffLineKindDto, ReadWorkspaceDiffRequestDto,
};
use super::service;
use crate::features::projects::domain::ProjectId;
use crate::features::projects::service::ProjectStore;
use crate::ipc::error::{AppErrorCode, AppErrorDto};

/// Monotonic suffix for command correlation ids (`req-<n>`).
static REQUEST_SEQ: AtomicU64 = AtomicU64::new(1);

fn request_id() -> String {
    format!("req-{}", REQUEST_SEQ.fetch_add(1, Ordering::Relaxed))
}

fn diff_error(error: DiffError) -> AppErrorDto {
    let (code, message) = match &error {
        DiffError::UnknownProject { project_id } => (
            AppErrorCode::PermissionDenied,
            format!("unknown project: {project_id}"),
        ),
        DiffError::PathDenied { path } => (
            AppErrorCode::PermissionDenied,
            format!("path is outside the authorized workspace root: {path}"),
        ),
        DiffError::NoWorkspaceRoots { project_id } => (
            AppErrorCode::PermissionDenied,
            format!("project has no authorized workspace root: {project_id}"),
        ),
        DiffError::NotARepository => (
            AppErrorCode::ValidationFailed,
            "the workspace root is not a git repository".to_owned(),
        ),
        DiffError::TooManyFiles { len } => (
            AppErrorCode::ValidationFailed,
            format!("diff exceeds the maximum changed files ({len} files)"),
        ),
        DiffError::TooManyHunks { path, len } => (
            AppErrorCode::ValidationFailed,
            format!("diff of {path} exceeds the maximum hunks ({len} hunks)"),
        ),
        DiffError::TooManyLines { path, len } => (
            AppErrorCode::ValidationFailed,
            format!("diff of {path} exceeds the maximum lines ({len} lines)"),
        ),
        DiffError::SourceTooLarge => (
            AppErrorCode::ValidationFailed,
            "diff exceeds the maximum accepted size".to_owned(),
        ),
        DiffError::SourceFailed => (
            AppErrorCode::InternalError,
            "the workspace diff could not be computed".to_owned(),
        ),
        DiffError::ParseFailed => (
            AppErrorCode::InternalError,
            "the workspace diff could not be parsed".to_owned(),
        ),
    };
    AppErrorDto::new(code, message, request_id())
}

fn to_line_dto(line: DiffLine) -> DiffLineDto {
    DiffLineDto {
        kind: match line.kind {
            DiffLineKind::Context => DiffLineKindDto::Context,
            DiffLineKind::Added => DiffLineKindDto::Added,
            DiffLineKind::Removed => DiffLineKindDto::Removed,
        },
        content: line.content,
    }
}

fn to_hunk_dto(hunk: DiffHunk) -> DiffHunkDto {
    DiffHunkDto {
        header: hunk.header,
        lines: hunk.lines.into_iter().map(to_line_dto).collect(),
    }
}

fn to_diff_file_dto(file: DiffFile) -> DiffFileDto {
    DiffFileDto {
        path: file.path,
        added_count: file.added_count,
        removed_count: file.removed_count,
        hunks: file.hunks.into_iter().map(to_hunk_dto).collect(),
    }
}

/// Reads the project's unified workspace diff; a clean tree resolves `[]`.
#[tauri::command]
pub async fn read_workspace_diff(
    projects: State<'_, ProjectStore>,
    source: State<'_, GitDiffSource>,
    request: ReadWorkspaceDiffRequestDto,
) -> Result<Vec<DiffFileDto>, AppErrorDto> {
    let project_id = ProjectId::new(request.project_id).map_err(|_| {
        AppErrorDto::new(
            AppErrorCode::ValidationFailed,
            "projectId is not a valid id".to_owned(),
            request_id(),
        )
    })?;
    let files = service::read_workspace_diff(&projects, source.inner(), &project_id)
        .await
        .map_err(diff_error)?;
    Ok(files.into_iter().map(to_diff_file_dto).collect())
}

#[cfg(test)]
mod tests {
    use super::super::adapters::git::parse_unified_diff;
    use super::*;

    fn fixture() -> serde_json::Value {
        let raw = include_str!("../../../../docs/ipc/fixtures/diff-read-workspace-diff.json");
        serde_json::from_str(raw).expect("diff fixture parses")
    }

    #[test]
    fn parsed_diff_matches_the_pinned_fixture() {
        let expected: Vec<DiffFileDto> = serde_json::from_value(fixture()["response"].clone())
            .expect("diff response deserializes");
        let patch = r#"diff --git a/src/App.tsx b/src/App.tsx
index 1111111..2222222 100644
--- a/src/App.tsx
+++ b/src/App.tsx
@@ -6,7 +6,8 @@ function App()
 function App() {
-  const [name, setName] = useState("");
+  const [provider, setProvider] = useState("claude");
+  const [model, setModel] = useState("sonnet");
 }
"#;
        let files = parse_unified_diff(patch).expect("valid patch");
        let actual: Vec<DiffFileDto> = files.into_iter().map(to_diff_file_dto).collect();
        assert_eq!(actual, expected);
    }

    #[test]
    fn a_clean_diff_maps_to_an_empty_list() {
        assert!(
            Vec::<DiffFile>::new()
                .into_iter()
                .map(to_diff_file_dto)
                .collect::<Vec<DiffFileDto>>()
                .is_empty()
        );
    }

    #[test]
    fn authority_failures_carry_permission_denied() {
        for error in [
            DiffError::UnknownProject {
                project_id: "proj-ghost".to_owned(),
            },
            DiffError::PathDenied {
                path: "/etc".to_owned(),
            },
            DiffError::NoWorkspaceRoots {
                project_id: "proj-test".to_owned(),
            },
        ] {
            let dto = diff_error(error);
            assert_eq!(dto.code, AppErrorCode::PermissionDenied);
            assert!(!dto.retryable);
        }
    }

    #[test]
    fn parser_failures_are_internal_errors() {
        let dto = diff_error(DiffError::ParseFailed);
        assert_eq!(dto.code, AppErrorCode::InternalError);
        assert!(dto.retryable);
        assert!(dto.request_id.starts_with("req-"));
    }

    #[test]
    fn collection_bounds_are_validation_errors() {
        let dto = diff_error(DiffError::TooManyFiles { len: 300 });
        assert_eq!(dto.code, AppErrorCode::ValidationFailed);
        assert!(dto.message.contains("changed files"));
    }
}
