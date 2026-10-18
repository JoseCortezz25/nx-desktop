//! Subagent wire DTOs (issue #16, slice 3).
//!
//! Wire shapes only: the child-run supervisor and the individual stop use case
//! live in #19/#23. A subagent's transcript is a child run's own message
//! stream, so this module reuses the conversation [`ConversationMessageDto`]
//! instead of keeping a second copy of the same product entity.

use crate::features::conversations::dto::ConversationMessageDto;
use serde::{Deserialize, Serialize};

/// Lifecycle state of a subagent.
///
/// All four states exist and a subagent can be stopped individually without
/// cancelling its parent run (`.claude/knowledge/business-logic.md` §3.2).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SubagentStatusDto {
    Processing,
    Finished,
    Failed,
    Cancelled,
}

/// A run's child agent with its own model, effort, duration and transcript.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubagentDto {
    pub id: String,
    pub name: String,
    /// Portable presentation key; the render layer maps it to a shape.
    pub avatar: String,
    pub status: SubagentStatusDto,
    /// Time the subagent has spent running, frozen when it leaves `processing`.
    pub elapsed_ms: u64,
    pub model_id: String,
    pub effort_level: String,
    /// The child run's own transcript, oldest first.
    pub transcript: Vec<ConversationMessageDto>,
}

/// Request envelope for `list_subagents`; `run_id` is the authority context.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ListSubagentsRequestDto {
    pub run_id: String,
}

/// Request envelope for `cancel_subagent`; the intent-driven individual stop.
///
/// Both ids are authority-bearing: the core resolves the child run within its
/// parent and rejects a subagent from another run.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CancelSubagentRequestDto {
    pub run_id: String,
    pub subagent_id: String,
}
