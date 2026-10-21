//! Working directory authority for OpenCode runs (issue #27).
//!
//! OpenCode edits files and runs commands in its working directory, so the
//! child's `cwd` is an Authority-tier decision: it is the project's first
//! authorized workspace root, canonicalized through the shared
//! `path_policy`, and it must be an existing directory. The run payload only
//! names the project, so the adapter resolves the directory through
//! [`WorkspaceDirectory`].
//!
//! [`ProjectWorkspaceDirectory`] reads the live `ProjectStore`. That store is
//! built in Tauri's `setup` hook (it needs the app data directory), after the
//! run router, so the resolver is bound to the app handle late; before
//! binding every lookup fails closed.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use tauri::Manager;

use crate::features::projects::domain::ProjectId;
use crate::features::projects::service::ProjectStore;
use crate::security::path_policy::canonicalize_or_normalize_root;

/// Resolves the directory a project's runs execute in.
pub trait WorkspaceDirectory: Send + Sync {
    /// The canonical, existing working directory for `project_id`, or `None`
    /// when the project is unknown or has no usable root on this machine.
    fn directory(&self, project_id: &str) -> Option<PathBuf>;
}

/// Canonicalizes the first root and keeps it only when it is a directory.
pub fn directory_from_roots(roots: &[String]) -> Option<PathBuf> {
    let root = roots.first()?;
    let canonical = canonicalize_or_normalize_root(Path::new(root)).ok()?;
    canonical.is_dir().then_some(canonical)
}

/// [`WorkspaceDirectory`] backed by the app's managed `ProjectStore`.
#[derive(Default)]
pub struct ProjectWorkspaceDirectory {
    app: OnceLock<tauri::AppHandle>,
}

impl ProjectWorkspaceDirectory {
    pub fn new() -> Self {
        Self::default()
    }

    /// Binds the app handle once `ProjectStore` is managed; later calls are
    /// ignored.
    pub fn bind(&self, app: tauri::AppHandle) {
        let _ = self.app.set(app);
    }
}

impl WorkspaceDirectory for ProjectWorkspaceDirectory {
    fn directory(&self, project_id: &str) -> Option<PathBuf> {
        let app = self.app.get()?;
        let store = app.try_state::<ProjectStore>()?;
        let project_id = ProjectId::new(project_id).ok()?;
        let roots = store.workspace_roots(&project_id).ok()?;
        directory_from_roots(&roots)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uses_the_first_existing_root_canonicalized() {
        let temp = std::env::temp_dir();
        let canonical = std::fs::canonicalize(&temp).expect("temp dir canonicalizes");
        let roots = vec![temp.to_string_lossy().into_owned()];
        assert_eq!(directory_from_roots(&roots), Some(canonical));
    }

    #[test]
    fn rejects_missing_relative_or_absent_roots() {
        assert_eq!(directory_from_roots(&[]), None);
        assert_eq!(directory_from_roots(&["relative/folder".to_owned()]), None);
        assert_eq!(
            directory_from_roots(&["/nx-desktop-definitely-missing/root".to_owned()]),
            None
        );
    }

    #[test]
    fn an_unbound_resolver_fails_closed() {
        assert_eq!(ProjectWorkspaceDirectory::new().directory("proj-1"), None);
    }
}
