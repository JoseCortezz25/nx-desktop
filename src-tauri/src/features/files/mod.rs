//! File open-target feature (issue #21).
//!
//! The wire DTOs (`dto.rs`) are frozen by the #16 contract; this module adds
//! the target domain, the launcher port, the OS-specific adapter, the use cases
//! and the `list_open_targets` / `open_in_target` commands.

pub mod adapters;
pub mod commands;
pub mod domain;
pub mod dto;
pub mod ports;
pub mod service;
