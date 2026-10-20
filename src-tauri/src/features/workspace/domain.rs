//! Workspace read domain (issue #21).
//!
//! Pure rules for reading one file through the workspace authority: the
//! document shape, the size bound and the error taxonomy. No Tauri, no Serde
//! wire attributes and no filesystem calls live here
//! (DTO ≠ Domain ≠ Adapter).

use crate::security::path_policy::PathPolicyError;

/// Maximum document size the right panel will load (Limits tier).
///
/// A source file or Markdown document is expected; 2 MiB leaves ample room
/// while keeping the IPC payload and the webview render bounded.
pub const MAX_DOCUMENT_BYTES: usize = 2 * 1024 * 1024;

/// One workspace file as read through the path policy.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileDocument {
    /// The workspace-relative path the caller asked for, echoed back.
    pub path: String,
    pub content: String,
}

/// The ways a workspace read can fail.
///
/// Kept free of IPC types on purpose: commands map each variant to an
/// `AppErrorDto`, so this enum never decides wire codes itself.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WorkspaceError {
    UnknownProject {
        project_id: String,
    },
    /// The request itself is malformed (empty or overlong path).
    InvalidPath {
        path: String,
    },
    /// The request escapes the project's authorized roots.
    PathDenied {
        path: String,
    },
    /// The document exceeds [`MAX_DOCUMENT_BYTES`].
    FileTooLarge {
        len: usize,
    },
    /// The OS refused access to an otherwise authorized path.
    OsPermissionDenied,
    /// The read failed for a reason that is not actionable by the caller.
    ReadFailed,
}

impl WorkspaceError {
    /// Maps a path-policy failure onto the workspace error taxonomy.
    ///
    /// Shape/limits failures stay `InvalidPath`; every authority failure —
    /// roots, traversal, absolute escape, symlink escape — is `PathDenied`.
    pub fn from_path_policy(error: PathPolicyError, requested: &str) -> Self {
        match error {
            PathPolicyError::EmptyPath | PathPolicyError::PathTooLong { .. } => Self::InvalidPath {
                path: requested.to_owned(),
            },
            PathPolicyError::RelativeRoot { .. }
            | PathPolicyError::TraversalEscape { .. }
            | PathPolicyError::AbsoluteEscape { .. }
            | PathPolicyError::SymlinkEscape { .. }
            | PathPolicyError::NoWorkspaceRoots => Self::PathDenied {
                path: requested.to_owned(),
            },
        }
    }
}
