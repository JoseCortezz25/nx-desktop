//! Hook review and approval policy feature (issue #20).
//!
//! The wire DTOs (`dto.rs`) are frozen by the #16 contract; this module adds
//! the hook domain, the approval matrix, the source/executor ports, the review
//! service, the `PreToolUse` process adapter and the `list_hooks` /
//! `set_hook_decision` commands.

pub mod adapters;
pub mod approval_policy;
pub mod commands;
pub mod domain;
pub mod dto;
pub mod ports;
pub mod service;
