//! Feature contract modules (issue #16).
//!
//! Slice 2 adds the wire DTO modules for the provider, project and conversation
//! catalogs; slice 3 adds runs (with the six-kind stream union) and subagents.
//! Services, commands, ports, adapters and supervisors belong to #17–#23 and
//! are deliberately absent here.

pub mod conversations;
pub mod projects;
pub mod providers;
pub mod runs;
pub mod subagents;
