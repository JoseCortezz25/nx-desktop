//! Hook adapters (issue #20).
//!
//! The fake source mirrors the frozen #16 hook fixtures; the process executor
//! is the real OS boundary.

pub mod fake;
pub mod process;
