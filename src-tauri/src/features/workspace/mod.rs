//! Workspace file feature (issue #21).
//!
//! The wire DTOs (`dto.rs`) are frozen by the #16 contract; this module adds
//! the read domain, the path-policy-backed service and the `read_file` command.

pub mod commands;
pub mod domain;
pub mod dto;
pub mod service;
