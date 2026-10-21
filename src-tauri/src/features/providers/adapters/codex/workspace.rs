//! Workspace `cwd` resolution for Codex runs (issue #26).
//!
//! The Codex CLI is a local agent: it must run inside the project's
//! authorized workspace folder. The run port carries only the validated
//! `project_id`, so the adapter asks a [`WorkspaceResolver`] for the root and
//! then re-canonicalizes it (Authority tier, `security-and-capabilities.md`
//! §3): the `cwd` handed to the child is always an existing, canonical
//! directory that the project registered through the path policy.
//!
//! The production resolver reads the managed [`ProjectStore`] through the
//! Tauri app handle, which only exists once `setup` runs, so it is bound
//! there; before that every lookup resolves to `None`.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use tauri::Manager;

use super::errors::workspace_unavailable;
use crate::features::projects::domain::ProjectId;
use crate::features::projects::service::ProjectStore;
use crate::features::runs::domain::RunFailure;
use crate::security::path_policy::canonicalize_or_normalize_root;

/// Looks up the registered workspace root of a project.
pub trait WorkspaceResolver: Send + Sync {
    /// The project's primary authorized workspace folder, if any.
    fn workspace_root(&self, project_id: &str) -> Option<PathBuf>;
}

/// Resolver over the app's managed [`ProjectStore`].
#[derive(Default)]
pub struct AppWorkspaceResolver {
    handle: OnceLock<tauri::AppHandle>,
}

impl AppWorkspaceResolver {
    /// Binds the app handle once `setup` has managed the project store.
    /// Later calls are ignored.
    pub fn bind(&self, handle: tauri::AppHandle) {
        let _ = self.handle.set(handle);
    }
}

impl WorkspaceResolver for AppWorkspaceResolver {
    fn workspace_root(&self, project_id: &str) -> Option<PathBuf> {
        let projects = self.handle.get()?.try_state::<ProjectStore>()?;
        let id = ProjectId::new(project_id).ok()?;
        let roots = projects.workspace_roots(&id).ok()?;
        roots.into_iter().next().map(PathBuf::from)
    }
}

/// The canonical, existing directory a run may use as its `cwd`.
pub fn run_directory(
    resolver: &dyn WorkspaceResolver,
    project_id: &str,
) -> Result<PathBuf, RunFailure> {
    let root = resolver
        .workspace_root(project_id)
        .ok_or_else(workspace_unavailable)?;
    canonical_directory(&root).ok_or_else(workspace_unavailable)
}

fn canonical_directory(root: &Path) -> Option<PathBuf> {
    // Relative roots are never authority; the policy rejects them.
    canonicalize_or_normalize_root(root).ok()?;
    let canonical = std::fs::canonicalize(root).ok()?;
    canonical.is_dir().then_some(canonical)
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixed(Option<PathBuf>);

    impl WorkspaceResolver for Fixed {
        fn workspace_root(&self, _project_id: &str) -> Option<PathBuf> {
            self.0.clone()
        }
    }

    #[test]
    fn resolves_an_existing_directory_canonically() {
        let temp = std::env::temp_dir();
        let resolved = run_directory(&Fixed(Some(temp.clone())), "p").expect("temp dir exists");
        assert_eq!(resolved, std::fs::canonicalize(temp).expect("canonical"));
    }

    #[test]
    fn rejects_missing_relative_or_file_roots() {
        assert!(run_directory(&Fixed(None), "p").is_err());
        assert!(run_directory(&Fixed(Some(PathBuf::from("relative/dir"))), "p").is_err());
        assert!(
            run_directory(
                &Fixed(Some(PathBuf::from("/definitely/not/a/real/nx-root"))),
                "p"
            )
            .is_err()
        );
        let file = std::env::current_exe().expect("test binary path");
        assert!(run_directory(&Fixed(Some(file)), "p").is_err());
    }

    #[test]
    fn an_unbound_app_resolver_resolves_nothing() {
        assert_eq!(AppWorkspaceResolver::default().workspace_root("p"), None);
    }
}
