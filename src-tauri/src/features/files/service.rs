//! Open-target use cases (issue #21).
//!
//! Authorizes the project root and the workspace-relative path through the
//! shared path policy before delegating the launch to the machine adapter. The
//! in-app targets never reach the launcher, and an unavailable tool is rejected
//! before spawning anything.

use std::path::{Path, PathBuf};

use super::domain::{OpenTarget, OpenTargetAvailability, OpenTargetError, is_launchable};
use super::ports::OpenTargetLauncher;
use crate::features::projects::domain::ProjectId;
use crate::features::projects::service::ProjectStore;
use crate::security::path_policy::resolve_in_workspaces;

/// Reports the machine's external open targets.
pub fn list_open_targets(launcher: &dyn OpenTargetLauncher) -> Vec<OpenTargetAvailability> {
    launcher.availability()
}

/// Opens one authorized workspace file in `target`.
pub fn open_in_target(
    projects: &ProjectStore,
    launcher: &dyn OpenTargetLauncher,
    project_id: &ProjectId,
    target: OpenTarget,
    requested: &str,
) -> Result<(), OpenTargetError> {
    if !is_launchable(target) {
        return Err(OpenTargetError::UnsupportedTarget {
            target: target.as_str().to_owned(),
        });
    }
    if Path::new(requested).is_absolute() {
        return Err(OpenTargetError::InvalidPath {
            path: requested.to_owned(),
        });
    }

    let folders =
        projects
            .workspace_roots(project_id)
            .map_err(|_| OpenTargetError::UnknownProject {
                project_id: project_id.as_str().to_owned(),
            })?;
    let roots: Vec<PathBuf> = folders.into_iter().map(PathBuf::from).collect();
    let resolved = resolve_in_workspaces(&roots, requested)
        .map_err(|error| OpenTargetError::from_path_policy(error, requested))?;
    if !resolved.is_file() {
        return Err(OpenTargetError::FileNotFound {
            path: requested.to_owned(),
        });
    }

    let is_installed = launcher
        .availability()
        .iter()
        .any(|availability| availability.target == target && availability.is_installed);
    if !is_installed {
        return Err(OpenTargetError::TargetUnavailable {
            target: target.as_str().to_owned(),
        });
    }

    launcher.launch(target, &resolved)
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::Mutex;

    use super::*;
    use crate::features::files::domain::OpenTargetAvailability;
    use crate::features::projects::domain::{ApprovalMode, Project};

    struct RecordingLauncher {
        available: Vec<OpenTargetAvailability>,
        launches: Mutex<Vec<(OpenTarget, PathBuf)>>,
    }

    impl RecordingLauncher {
        fn new(available: Vec<OpenTargetAvailability>) -> Self {
            Self {
                available,
                launches: Mutex::new(Vec::new()),
            }
        }

        fn launches(&self) -> Vec<(OpenTarget, PathBuf)> {
            self.launches
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .clone()
        }
    }

    impl OpenTargetLauncher for RecordingLauncher {
        fn availability(&self) -> Vec<OpenTargetAvailability> {
            self.available.clone()
        }

        fn launch(&self, target: OpenTarget, path: &Path) -> Result<(), OpenTargetError> {
            self.launches
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .push((target, path.to_path_buf()));
            Ok(())
        }
    }

    fn temp_workspace(name: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("nx-open-target-{name}-{}", std::process::id()));
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

    fn available_editor_and_reveal() -> Vec<OpenTargetAvailability> {
        vec![
            OpenTargetAvailability {
                target: OpenTarget::Editor,
                is_installed: true,
            },
            OpenTargetAvailability {
                target: OpenTarget::RevealInFileManager,
                is_installed: true,
            },
        ]
    }

    #[test]
    fn reports_the_launcher_availability() {
        let launcher = RecordingLauncher::new(available_editor_and_reveal());
        assert_eq!(list_open_targets(&launcher), available_editor_and_reveal());
    }

    #[test]
    fn opens_an_authorized_file_in_the_editor() {
        let root = temp_workspace("editor");
        fs::create_dir_all(root.join("src")).expect("nested dir");
        fs::write(root.join("src/App.tsx"), "export {};\n").expect("fixture file");
        let store = store_with_root(&root);
        let launcher = RecordingLauncher::new(available_editor_and_reveal());

        open_in_target(
            &store,
            &launcher,
            &project_id(),
            OpenTarget::Editor,
            "src/App.tsx",
        )
        .expect("launch accepted");

        assert_eq!(
            launcher.launches(),
            vec![(OpenTarget::Editor, root.join("src/App.tsx"))]
        );
        fs::remove_dir_all(&root).expect("scratch cleanup");
    }

    #[test]
    fn rejects_the_in_app_targets() {
        let root = temp_workspace("in-app");
        fs::write(root.join("App.tsx"), "").expect("fixture file");
        let store = store_with_root(&root);
        let launcher = RecordingLauncher::new(available_editor_and_reveal());
        for target in [
            OpenTarget::ViewSource,
            OpenTarget::SearchInFile,
            OpenTarget::CopyPath,
        ] {
            assert_eq!(
                open_in_target(&store, &launcher, &project_id(), target, "App.tsx")
                    .expect_err("in-app target"),
                OpenTargetError::UnsupportedTarget {
                    target: target.as_str().to_owned(),
                }
            );
        }
        assert!(launcher.launches().is_empty());
        fs::remove_dir_all(&root).expect("scratch cleanup");
    }

    #[test]
    fn rejects_an_unavailable_target() {
        let root = temp_workspace("unavailable");
        fs::write(root.join("App.tsx"), "").expect("fixture file");
        let store = store_with_root(&root);
        let launcher = RecordingLauncher::new(vec![OpenTargetAvailability {
            target: OpenTarget::Editor,
            is_installed: false,
        }]);
        assert_eq!(
            open_in_target(
                &store,
                &launcher,
                &project_id(),
                OpenTarget::Editor,
                "App.tsx"
            )
            .expect_err("editor unavailable"),
            OpenTargetError::TargetUnavailable {
                target: "editor".to_owned(),
            }
        );
        assert!(launcher.launches().is_empty());
        fs::remove_dir_all(&root).expect("scratch cleanup");
    }

    #[test]
    fn rejects_a_missing_file() {
        let root = temp_workspace("missing");
        let store = store_with_root(&root);
        let launcher = RecordingLauncher::new(available_editor_and_reveal());
        assert_eq!(
            open_in_target(
                &store,
                &launcher,
                &project_id(),
                OpenTarget::Editor,
                "missing.tsx"
            )
            .expect_err("missing file"),
            OpenTargetError::FileNotFound {
                path: "missing.tsx".to_owned(),
            }
        );
        fs::remove_dir_all(&root).expect("scratch cleanup");
    }

    #[test]
    fn rejects_a_traversal_escape() {
        let root = temp_workspace("escape");
        let store = store_with_root(&root);
        let launcher = RecordingLauncher::new(available_editor_and_reveal());
        assert_eq!(
            open_in_target(
                &store,
                &launcher,
                &project_id(),
                OpenTarget::Editor,
                "../secret.txt"
            )
            .expect_err("traversal"),
            OpenTargetError::PathDenied {
                path: "../secret.txt".to_owned(),
            }
        );
        fs::remove_dir_all(&root).expect("scratch cleanup");
    }

    #[test]
    fn rejects_an_absolute_request() {
        let root = temp_workspace("absolute");
        let store = store_with_root(&root);
        let launcher = RecordingLauncher::new(available_editor_and_reveal());
        let absolute = root.join("App.tsx");
        assert_eq!(
            open_in_target(
                &store,
                &launcher,
                &project_id(),
                OpenTarget::Editor,
                &absolute.to_string_lossy()
            )
            .expect_err("absolute request"),
            OpenTargetError::InvalidPath {
                path: absolute.to_string_lossy().into_owned(),
            }
        );
        assert!(launcher.launches().is_empty());
        fs::remove_dir_all(&root).expect("scratch cleanup");
    }

    #[test]
    fn rejects_an_unknown_project() {
        let store = ProjectStore::seeded();
        let launcher = RecordingLauncher::new(available_editor_and_reveal());
        assert_eq!(
            open_in_target(
                &store,
                &launcher,
                &ProjectId::new("proj-ghost").expect("id"),
                OpenTarget::Editor,
                "src/App.tsx"
            )
            .expect_err("unknown project"),
            OpenTargetError::UnknownProject {
                project_id: "proj-ghost".to_owned(),
            }
        );
    }
}
