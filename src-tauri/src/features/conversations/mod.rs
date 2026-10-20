//! Conversation feature (issue #18, persistence added by #22).
//!
//! The wire DTOs (`dto.rs`) are frozen by the #16 contract; this module adds
//! the domain invariants, the `ConversationStore` service, its versioned JSON
//! persistence and the conversation commands. No `ports.rs`: the only external
//! seam is the shared JSON file helper.

pub mod commands;
pub mod domain;
pub mod dto;
pub mod persistence;
pub mod service;
