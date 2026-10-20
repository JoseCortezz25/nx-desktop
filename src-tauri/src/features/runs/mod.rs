//! Run feature foundation (issue #19).
//!
//! The wire DTOs (`dto.rs`) are frozen by the #16 contract; this slice adds
//! the lifecycle domain, the adapter/transport ports, the fake runner and the
//! `RunSupervisor`. The commands that drive them land in the next slice.

pub mod adapters;
pub mod domain;
pub mod dto;
pub mod ports;
pub mod supervisor;
