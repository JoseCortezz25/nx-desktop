//! Open-target domain (issue #21).
//!
//! The closed `OpenTarget` vocabulary and the authority rules behind the
//! `Abrir` command. The product decision offers only VS Code in the menu
//! (`business-logic.md` §3.5 item 3); the core additionally implements the
//! OS-specific reveal action required by #21, while the three in-app actions
//! (`view_source`, `search_in_file`, `copy_path`) never cross the process
//! boundary.

use crate::security::path_policy::PathPolicyError;

/// A place a file can be opened into.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum OpenTarget {
    Editor,
    ViewSource,
    SearchInFile,
    RevealInFileManager,
    CopyPath,
}

impl OpenTarget {
    /// Stable diagnostic name; the wire shape is the DTO's concern.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Editor => "editor",
            Self::ViewSource => "view_source",
            Self::SearchInFile => "search_in_file",
            Self::RevealInFileManager => "reveal_in_file_manager",
            Self::CopyPath => "copy_path",
        }
    }
}

/// One external target's availability on the machine.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct OpenTargetAvailability {
    pub target: OpenTarget,
    pub is_installed: bool,
}

/// Whether the core may launch this target as an external process.
///
/// `view_source`, `search_in_file` and `copy_path` are in-app UI actions: they
/// have no executable and must never reach the launcher.
pub fn is_launchable(target: OpenTarget) -> bool {
    matches!(target, OpenTarget::Editor | OpenTarget::RevealInFileManager)
}

/// The ways an open-target request can fail.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OpenTargetError {
    UnknownProject { project_id: String },
    InvalidPath { path: String },
    PathDenied { path: String },
    UnsupportedTarget { target: String },
    FileNotFound { path: String },
    TargetUnavailable { target: String },
    LaunchFailed { target: String },
}

impl OpenTargetError {
    /// Maps the shared path-policy failures onto this feature's taxonomy.
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
