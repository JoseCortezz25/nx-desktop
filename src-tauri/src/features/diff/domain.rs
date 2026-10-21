//! Workspace diff domain (issue #21).
//!
//! Unified-only change set (`business-logic.md` §3.5 item 1): one file, its
//! hunks and the repository's added/removed counts. No Tauri, no Serde wire
//! attributes and no git protocol live here.

/// Maximum changed files returned by one workspace diff (Limits tier).
pub const MAX_DIFF_FILES: usize = 256;

/// Maximum hunks per changed file (Limits tier).
pub const MAX_HUNKS_PER_FILE: usize = 512;

/// Maximum diff lines per changed file (Limits tier).
pub const MAX_LINES_PER_FILE: usize = 5_000;

/// Maximum raw `git diff` output accepted from the adapter (Limits tier).
pub const MAX_DIFF_BYTES: usize = 5 * 1024 * 1024;

/// How a unified diff line relates to the previous revision.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiffLineKind {
    Context,
    Added,
    Removed,
}

/// One line of a unified diff hunk.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiffLine {
    pub kind: DiffLineKind,
    pub content: String,
}

/// One `@@` hunk of a changed file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiffHunk {
    pub header: String,
    pub lines: Vec<DiffLine>,
}

/// One changed file, in repository order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiffFile {
    pub path: String,
    pub added_count: u32,
    pub removed_count: u32,
    pub hunks: Vec<DiffHunk>,
}

/// The ways a workspace diff can fail.
///
/// Kept free of IPC types on purpose: commands map each variant to an
/// `AppErrorDto`, so this enum never decides wire codes itself.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DiffError {
    UnknownProject {
        project_id: String,
    },
    /// The project has no authorized workspace root to inspect.
    NoWorkspaceRoots {
        project_id: String,
    },
    PathDenied {
        path: String,
    },
    /// The first authorized root is not a git work tree.
    NotARepository,
    TooManyFiles {
        len: usize,
    },
    TooManyHunks {
        path: String,
        len: usize,
    },
    TooManyLines {
        path: String,
        len: usize,
    },
    /// The adapter's raw output exceeded the configured byte bound.
    SourceTooLarge,
    /// The adapter could not run or complete git.
    SourceFailed,
    /// The adapter produced output the parser could not understand.
    ParseFailed,
}
