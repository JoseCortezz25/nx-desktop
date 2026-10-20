//! Project feature (issue #18).
//!
//! The wire DTOs (`dto.rs`) are frozen by the #16 contract; this module adds
//! the domain invariants, the `ProjectStore` service and the project commands.
//! No `ports.rs`: persistence is an in-memory managed store, not an external
//! seam, and the branch map is seeded authority data (real `git` discovery is
//! a later ticket), so no trait has two plausible implementations here.

pub mod commands;
pub mod domain;
pub mod dto;
pub mod service;
