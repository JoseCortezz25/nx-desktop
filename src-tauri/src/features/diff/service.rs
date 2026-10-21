//! Workspace diff use case (issue #21).
//!
//! Resolves the project's first authorized root (the frozen request has no
//! folder field), canonicalizes it and asks the diff source for the unified
//! change set. Bounds are re-checked here so a scripted or third-party source
//! cannot bypass them.
//!
//! Multi-root limitation: with several authorized folders there is no contract
//! field to choose one, so the first root is inspected and the limitation is
//! recorded in the issue task log.

use std::path::Path;

use super::domain::{DiffError, DiffFile, MAX_DIFF_FILES, MAX_HUNKS_PER_FILE, MAX_LINES_PER_FILE};
use super::ports::{DiffSourceError, WorkspaceDiffSource};
use crate::features::projects::domain::ProjectId;
use crate::features::projects::service::ProjectStore;
use crate::security::path_policy::canonicalize_or_normalize_root;

/// Reads the unified change set of one project.
pub async fn read_workspace_diff(
    projects: &ProjectStore,
    source: &dyn WorkspaceDiffSource,
    project_id: &ProjectId,
) -> Result<Vec<DiffFile>, DiffError> {
    let folders = projects
        .workspace_roots(project_id)
        .map_err(|_| DiffError::UnknownProject {
            project_id: project_id.as_str().to_owned(),
        })?;
    let folder = folders.first().ok_or_else(|| DiffError::NoWorkspaceRoots {
        project_id: project_id.as_str().to_owned(),
    })?;
    let cwd =
        canonicalize_or_normalize_root(Path::new(folder)).map_err(|_| DiffError::PathDenied {
            path: folder.clone(),
        })?;
    if !cwd.is_dir() {
        return Err(DiffError::NotARepository);
    }

    let files = source.read(&cwd).await.map_err(source_error)?;
    validate_bounds(&files)?;
    Ok(files)
}

fn source_error(error: DiffSourceError) -> DiffError {
    match error {
        DiffSourceError::NotARepository => DiffError::NotARepository,
        DiffSourceError::GitUnavailable | DiffSourceError::Timeout | DiffSourceError::Failed => {
            DiffError::SourceFailed
        }
        DiffSourceError::TooLarge => DiffError::SourceTooLarge,
        DiffSourceError::ParseFailed => DiffError::ParseFailed,
    }
}

fn validate_bounds(files: &[DiffFile]) -> Result<(), DiffError> {
    if files.len() > MAX_DIFF_FILES {
        return Err(DiffError::TooManyFiles { len: files.len() });
    }
    for file in files {
        if file.hunks.len() > MAX_HUNKS_PER_FILE {
            return Err(DiffError::TooManyHunks {
                path: file.path.clone(),
                len: file.hunks.len(),
            });
        }
        let lines: usize = file.hunks.iter().map(|hunk| hunk.lines.len()).sum();
        if lines > MAX_LINES_PER_FILE {
            return Err(DiffError::TooManyLines {
                path: file.path.clone(),
                len: lines,
            });
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::Mutex;

    use super::*;
    use crate::features::diff::domain::{DiffHunk, DiffLine, DiffLineKind};
    use crate::features::diff::ports::{BoxFuture, DiffSourceError, WorkspaceDiffSource};
    use crate::features::projects::domain::{ApprovalMode, Project};

    struct RecordingSource {
        files: Vec<DiffFile>,
        error: Option<DiffSourceError>,
        cwd: Mutex<Option<PathBuf>>,
    }

    impl RecordingSource {
        fn with_files(files: Vec<DiffFile>) -> Self {
            Self {
                files,
                error: None,
                cwd: Mutex::new(None),
            }
        }

        fn failing(error: DiffSourceError) -> Self {
            Self {
                files: Vec::new(),
                error: Some(error),
                cwd: Mutex::new(None),
            }
        }

        fn cwd(&self) -> Option<PathBuf> {
            self.cwd
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .clone()
        }
    }

    impl WorkspaceDiffSource for RecordingSource {
        fn read(&self, cwd: &Path) -> BoxFuture<'_, Result<Vec<DiffFile>, DiffSourceError>> {
            *self
                .cwd
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(cwd.to_path_buf());
            let files = self.files.clone();
            let error = self.error;
            Box::pin(async move { error.map_or(Ok(files), Err) })
        }
    }

    fn temp_workspace(name: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("nx-diff-service-{name}-{}", std::process::id()));
        if root.exists() {
            fs::remove_dir_all(&root).expect("scratch workspace resets");
        }
        fs::create_dir_all(&root).expect("scratch workspace exists");
        root
    }

    fn store_with_roots(roots: &[&Path]) -> ProjectStore {
        ProjectStore::from_projects(vec![Project {
            id: ProjectId::new("proj-test").expect("fixture id"),
            name: "Test".to_owned(),
            workspace_folders: roots
                .iter()
                .map(|root| root.to_string_lossy().into_owned())
                .collect(),
            approval_mode: ApprovalMode::AskAlways,
            hook_decisions: Vec::new(),
            conversation_ids: Vec::new(),
        }])
    }

    fn project_id() -> ProjectId {
        ProjectId::new("proj-test").expect("fixture id")
    }

    fn file(path: &str) -> DiffFile {
        DiffFile {
            path: path.to_owned(),
            added_count: 1,
            removed_count: 0,
            hunks: vec![DiffHunk {
                header: "@@ -1 +1 @@".to_owned(),
                lines: vec![DiffLine {
                    kind: DiffLineKind::Added,
                    content: "added".to_owned(),
                }],
            }],
            notice: None,
        }
    }

    #[tokio::test]
    async fn reads_the_first_authorized_root() {
        let first = temp_workspace("first");
        let second = temp_workspace("second");
        let store = store_with_roots(&[&first, &second]);
        let source = RecordingSource::with_files(vec![file("app.ts")]);

        let files = read_workspace_diff(&store, &source, &project_id())
            .await
            .expect("diff succeeds");
        assert_eq!(files, vec![file("app.ts")]);
        assert_eq!(
            source.cwd().and_then(|cwd| cwd.canonicalize().ok()),
            first.canonicalize().ok()
        );

        fs::remove_dir_all(&first).expect("scratch cleanup");
        fs::remove_dir_all(&second).expect("scratch cleanup");
    }

    #[tokio::test]
    async fn rejects_an_unknown_project() {
        let store = ProjectStore::seeded();
        let source = RecordingSource::with_files(Vec::new());
        assert_eq!(
            read_workspace_diff(&store, &source, &ProjectId::new("proj-ghost").expect("id"))
                .await
                .expect_err("unknown project"),
            DiffError::UnknownProject {
                project_id: "proj-ghost".to_owned(),
            }
        );
    }

    #[tokio::test]
    async fn rejects_a_project_without_workspace_roots() {
        let store = store_with_roots(&[]);
        let source = RecordingSource::with_files(Vec::new());
        assert_eq!(
            read_workspace_diff(&store, &source, &project_id())
                .await
                .expect_err("no roots"),
            DiffError::NoWorkspaceRoots {
                project_id: "proj-test".to_owned(),
            }
        );
    }

    #[tokio::test]
    async fn rejects_a_root_that_does_not_exist() {
        let missing = std::env::temp_dir().join(format!("nx-diff-missing-{}", std::process::id()));
        let store = store_with_roots(&[&missing]);
        let source = RecordingSource::with_files(Vec::new());
        assert_eq!(
            read_workspace_diff(&store, &source, &project_id())
                .await
                .expect_err("missing root"),
            DiffError::NotARepository
        );
        assert_eq!(source.cwd(), None);
    }

    #[tokio::test]
    async fn maps_source_failures() {
        let root = temp_workspace("failure");
        let store = store_with_roots(&[&root]);
        for (source_error, expected) in [
            (DiffSourceError::NotARepository, DiffError::NotARepository),
            (DiffSourceError::Failed, DiffError::SourceFailed),
            (DiffSourceError::ParseFailed, DiffError::ParseFailed),
            (DiffSourceError::TooLarge, DiffError::SourceTooLarge),
        ] {
            let source = RecordingSource::failing(source_error);
            assert_eq!(
                read_workspace_diff(&store, &source, &project_id())
                    .await
                    .expect_err("source failure"),
                expected
            );
        }
        fs::remove_dir_all(&root).expect("scratch cleanup");
    }

    #[tokio::test]
    async fn caps_the_file_collection() {
        let root = temp_workspace("files");
        let store = store_with_roots(&[&root]);
        let files = (0..=MAX_DIFF_FILES)
            .map(|index| file(&format!("f{index}.rs")))
            .collect();
        let source = RecordingSource::with_files(files);
        assert_eq!(
            read_workspace_diff(&store, &source, &project_id())
                .await
                .expect_err("too many files"),
            DiffError::TooManyFiles {
                len: MAX_DIFF_FILES + 1,
            }
        );
        fs::remove_dir_all(&root).expect("scratch cleanup");
    }

    #[tokio::test]
    async fn caps_the_lines_of_one_file() {
        let root = temp_workspace("lines");
        let store = store_with_roots(&[&root]);
        let lines = (0..=MAX_LINES_PER_FILE)
            .map(|index| DiffLine {
                kind: DiffLineKind::Context,
                content: format!("line {index}"),
            })
            .collect();
        let source = RecordingSource::with_files(vec![DiffFile {
            path: "app.ts".to_owned(),
            added_count: 0,
            removed_count: 0,
            hunks: vec![DiffHunk {
                header: "@@ -1 +1 @@".to_owned(),
                lines,
            }],
            notice: None,
        }]);
        assert_eq!(
            read_workspace_diff(&store, &source, &project_id())
                .await
                .expect_err("too many lines"),
            DiffError::TooManyLines {
                path: "app.ts".to_owned(),
                len: MAX_LINES_PER_FILE + 1,
            }
        );
        fs::remove_dir_all(&root).expect("scratch cleanup");
    }
}
