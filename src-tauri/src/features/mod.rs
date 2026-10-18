//! Feature contract modules (issue #16).
//!
//! Slice 2 adds the wire DTO modules for the provider, project and conversation
//! catalogs. Services, commands, ports, adapters and supervisors belong to
//! #17–#21 and are deliberately absent here.

pub mod conversations;
pub mod projects;
pub mod providers;
