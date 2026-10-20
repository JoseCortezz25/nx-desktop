//! Diff feature (issue #21).
//!
//! The wire DTOs (`dto.rs`) are frozen by the #16 contract; this module adds
//! the unified diff domain, the git source/parser, the service and the
//! `read_workspace_diff` command.

pub mod adapters;
pub mod commands;
pub mod domain;
pub mod dto;
pub mod ports;
pub mod service;
