//! Workspace read use case (issue #21).
//!
//! Resolves the project's authorized roots through the shared path policy and
//! reads the file off the async executor with `spawn_blocking`. The service
//! never touches Tauri and never holds a `MutexGuard` across an `.await`: the
//! folder list is cloned under a short store lock before the read starts.
//!
//! A missing path, a directory or non-UTF-8 content resolves `None` — "the path
//! holds no document" in the contract — while an oversized document is a Limits
//! failure and an OS permission error retains its own classification.

use std::path::{Path, PathBuf};

use super::domain::{FileDocument, MAX_DOCUMENT_BYTES, WorkspaceError};
use crate::features::projects::domain::ProjectId;
use crate::features::projects::service::ProjectStore;
use crate::security::path_policy::resolve_in_workspaces;

/// Reads one workspace-relative file for the right panel.
pub async fn read_file(
    projects: &ProjectStore,
    project_id: &ProjectId,
    requested: &str,
) -> Result<Option<FileDocument>, WorkspaceError> {
    if Path::new(requested).is_absolute() {
        return Err(WorkspaceError::InvalidPath {
            path: requested.to_owned(),
        });
    }
    let folders =
        projects
            .workspace_roots(project_id)
            .map_err(|_| WorkspaceError::UnknownProject {
                project_id: project_id.as_str().to_owned(),
            })?;
    let roots: Vec<PathBuf> = folders.into_iter().map(PathBuf::from).collect();
    let resolved = resolve_in_workspaces(&roots, requested)
        .map_err(|error| WorkspaceError::from_path_policy(error, requested))?;

    let path = resolved;
    let result = tokio::task::spawn_blocking(move || read_blocking(&path)).await;
    match result {
        Ok(Ok(Some(bytes))) => Ok(String::from_utf8(bytes).ok().map(|content| FileDocument {
            path: requested.to_owned(),
            content,
        })),
        Ok(Ok(None)) => Ok(None),
        Ok(Err(error)) => Err(error),
        Err(_) => Err(WorkspaceError::ReadFailed),
    }
}

/// Blocking half of the read: metadata first, so an oversized file is rejected
/// before its bytes are loaded, and non-file paths resolve as "no document".
fn read_blocking(path: &Path) -> Result<Option<Vec<u8>>, WorkspaceError> {
    let metadata = match std::fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
            return Err(WorkspaceError::OsPermissionDenied);
        }
        Err(_) => return Err(WorkspaceError::ReadFailed),
    };
    if !metadata.is_file() {
        return Ok(None);
    }
    let size = usize::try_from(metadata.len()).unwrap_or(usize::MAX);
    if size > MAX_DOCUMENT_BYTES {
        return Err(WorkspaceError::FileTooLarge { len: size });
    }
    match std::fs::read(path) {
        Ok(bytes) if bytes.len() > MAX_DOCUMENT_BYTES => {
            Err(WorkspaceError::FileTooLarge { len: bytes.len() })
        }
        Ok(bytes) => Ok(Some(bytes)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
            Err(WorkspaceError::OsPermissionDenied)
        }
        Err(_) => Err(WorkspaceError::ReadFailed),
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;

    use super::*;
    use crate::features::projects::domain::{ApprovalMode, Project};
    use crate::features::workspace::domain::MAX_DOCUMENT_BYTES;

    fn temp_workspace(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("nx-workspace-{name}-{}", std::process::id()));
        if root.exists() {
            fs::remove_dir_all(&root).expect("scratch workspace resets");
        }
        fs::create_dir_all(&root).expect("scratch workspace exists");
        root
    }

    fn store_with_root(root: &Path) -> ProjectStore {
        ProjectStore::from_projects(vec![Project {
            id: ProjectId::new("proj-test").expect("fixture id"),
            name: "Test".to_owned(),
            workspace_folders: vec![root.to_string_lossy().into_owned()],
            approval_mode: ApprovalMode::AskAlways,
            hook_decisions: Vec::new(),
            conversation_ids: Vec::new(),
        }])
    }

    fn project_id() -> ProjectId {
        ProjectId::new("proj-test").expect("fixture id")
    }

    #[tokio::test]
    async fn reads_a_workspace_file() {
        let root = temp_workspace("read");
        fs::create_dir_all(root.join("docs")).expect("nested dir");
        fs::write(root.join("docs/readme.md"), "# Title\n").expect("fixture file");
        let store = store_with_root(&root);

        let document = read_file(&store, &project_id(), "docs/readme.md")
            .await
            .expect("read succeeds")
            .expect("document exists");
        assert_eq!(document.path, "docs/readme.md");
        assert_eq!(document.content, "# Title\n");
        fs::remove_dir_all(&root).expect("scratch cleanup");
    }

    #[tokio::test]
    async fn resolves_a_missing_path_to_no_document() {
        let root = temp_workspace("missing");
        let store = store_with_root(&root);
        assert_eq!(
            read_file(&store, &project_id(), "does/not/exist.md")
                .await
                .expect("missing path is not an error"),
            None
        );
        fs::remove_dir_all(&root).expect("scratch cleanup");
    }

    #[tokio::test]
    async fn resolves_a_directory_to_no_document() {
        let root = temp_workspace("directory");
        fs::create_dir_all(root.join("src")).expect("nested dir");
        let store = store_with_root(&root);
        assert_eq!(
            read_file(&store, &project_id(), "src")
                .await
                .expect("directory is not an error"),
            None
        );
        fs::remove_dir_all(&root).expect("scratch cleanup");
    }

    #[tokio::test]
    async fn resolves_non_utf8_content_to_no_document() {
        let root = temp_workspace("binary");
        fs::write(root.join("binary.bin"), [0xff, 0xfe, 0x00]).expect("fixture file");
        let store = store_with_root(&root);
        assert_eq!(
            read_file(&store, &project_id(), "binary.bin")
                .await
                .expect("binary is not an error"),
            None
        );
        fs::remove_dir_all(&root).expect("scratch cleanup");
    }

    #[tokio::test]
    async fn rejects_traversal_and_absolute_requests() {
        let root = temp_workspace("escape");
        fs::create_dir_all(root.join("docs")).expect("nested dir");
        fs::write(root.join("docs/readme.md"), "inside").expect("fixture file");
        let store = store_with_root(&root);
        assert_eq!(
            read_file(&store, &project_id(), "../secret.txt")
                .await
                .expect_err("traversal"),
            WorkspaceError::PathDenied {
                path: "../secret.txt".to_owned(),
            }
        );
        assert_eq!(
            read_file(&store, &project_id(), "/etc/passwd")
                .await
                .expect_err("absolute escape"),
            WorkspaceError::InvalidPath {
                path: "/etc/passwd".to_owned(),
            }
        );
        assert_eq!(
            read_file(
                &store,
                &project_id(),
                &root.join("docs/readme.md").to_string_lossy()
            )
            .await
            .expect_err("absolute request is outside the contract"),
            WorkspaceError::InvalidPath {
                path: root.join("docs/readme.md").to_string_lossy().into_owned(),
            }
        );
        fs::remove_dir_all(&root).expect("scratch cleanup");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn rejects_a_symlink_escape() {
        let root = temp_workspace("symlink");
        let outside = temp_workspace("symlink-outside");
        fs::write(outside.join("secret.txt"), "secret").expect("outside file");
        std::os::unix::fs::symlink(&outside, root.join("link")).expect("symlink");
        let store = store_with_root(&root);
        assert_eq!(
            read_file(&store, &project_id(), "link/secret.txt")
                .await
                .expect_err("symlink escape"),
            WorkspaceError::PathDenied {
                path: "link/secret.txt".to_owned(),
            }
        );
        fs::remove_dir_all(&root).expect("scratch cleanup");
        fs::remove_dir_all(&outside).expect("scratch cleanup");
    }

    #[tokio::test]
    async fn rejects_an_oversized_document() {
        let root = temp_workspace("large");
        let path = root.join("large.txt");
        let file = fs::File::create(&path).expect("fixture file");
        file.set_len((MAX_DOCUMENT_BYTES + 1) as u64)
            .expect("sparse file");
        let store = store_with_root(&root);
        assert_eq!(
            read_file(&store, &project_id(), "large.txt")
                .await
                .expect_err("oversized document"),
            WorkspaceError::FileTooLarge {
                len: MAX_DOCUMENT_BYTES + 1,
            }
        );
        fs::remove_dir_all(&root).expect("scratch cleanup");
    }

    #[tokio::test]
    async fn rejects_an_unknown_project() {
        let store = ProjectStore::seeded();
        assert_eq!(
            read_file(
                &store,
                &ProjectId::new("proj-ghost").expect("id"),
                "src/App.tsx"
            )
            .await
            .expect_err("unknown project"),
            WorkspaceError::UnknownProject {
                project_id: "proj-ghost".to_owned(),
            }
        );
    }
}
