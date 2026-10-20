//! Run feature (issue #19).
//!
//! The wire DTOs (`dto.rs`) are frozen by the #16 contract; this module adds
//! the lifecycle domain, the adapter/transport ports, the `RunSupervisor`, the
//! start/cancel/snapshot use cases and the three commands that drive a run.

pub mod adapters;
pub mod commands;
pub mod domain;
pub mod dto;
pub mod ports;
pub mod service;
pub mod supervisor;
