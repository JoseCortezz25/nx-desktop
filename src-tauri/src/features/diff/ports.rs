//! Workspace diff source port (issue #21).
//!
//! The git process is an external boundary: the service depends on this trait,
//! `adapters/git.rs` runs and parses the unified diff, and tests inject a
//! scripted source.

use std::future::Future;
use std::path::Path;
use std::pin::Pin;

use super::domain::DiffFile;

/// A boxed, sendable future returned by the diff port.
pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// The ways the underlying source can fail before producing files.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiffSourceError {
    /// The authorized directory is not a git work tree.
    NotARepository,
    /// The git executable could not be spawned.
    GitUnavailable,
    /// Git exceeded its execution timeout.
    Timeout,
    /// Git exited with a failure status.
    Failed,
    /// The raw diff exceeded [`super::domain::MAX_DIFF_BYTES`].
    TooLarge,
    /// The raw diff could not be parsed or exceeded a collection bound.
    ParseFailed,
}

/// Reads the unified change set of one authorized work tree.
pub trait WorkspaceDiffSource: Send + Sync {
    fn read(&self, cwd: &Path) -> BoxFuture<'_, Result<Vec<DiffFile>, DiffSourceError>>;
}
