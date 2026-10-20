//! Conversation feature (issue #18).
//!
//! The wire DTOs (`dto.rs`) are frozen by the #16 contract; this module adds
//! the domain invariants, the `ConversationStore` service and the conversation
//! commands. No `ports.rs`: persistence is an in-memory managed store, not an
//! external seam, so no trait has two plausible implementations here.

pub mod commands;
pub mod domain;
pub mod dto;
pub mod service;
