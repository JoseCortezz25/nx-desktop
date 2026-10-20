//! Provider feature (issue #17).
//!
//! The wire DTOs (`dto.rs`) are frozen by the #16 contract; this module adds
//! the domain invariants, the `AgentProvider` port, the registry service and
//! the `list_providers` / `list_models` commands.

pub mod adapters;
pub mod commands;
pub mod domain;
pub mod dto;
pub mod ports;
pub mod service;
