//! Open-target port (issue #21).
//!
//! The machine probe and the external launch are one boundary: the same
//! adapter must answer "is VS Code installed?" and "launch it", or the report
//! and the action can disagree. Tests inject a recording launcher.

use std::path::Path;

use super::domain::{OpenTarget, OpenTargetAvailability, OpenTargetError};

/// Probes and launches external open targets on this machine.
pub trait OpenTargetLauncher: Send + Sync {
    /// Every external target the machine knows, installed or not.
    ///
    /// In-app actions (`view_source`, `search_in_file`, `copy_path`) are not
    /// machine targets and are not reported here.
    fn availability(&self) -> Vec<OpenTargetAvailability>;

    /// Launches one already-authorized workspace file in `target`.
    fn launch(&self, target: OpenTarget, path: &Path) -> Result<(), OpenTargetError>;
}
