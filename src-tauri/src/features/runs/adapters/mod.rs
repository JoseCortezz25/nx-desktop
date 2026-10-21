//! Run adapter implementations (issue #19).
//!
//! The fake engine ships here alongside the provider router (#25), which
//! dispatches each run to the engine adapter registered for its provider —
//! the Claude adapter lives in `providers/adapters/claude/` and implements the
//! same [`super::ports::AgentRunner`] seam.

pub mod fake;
pub mod routing;
