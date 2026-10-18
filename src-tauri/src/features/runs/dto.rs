//! Run wire DTOs (issue #16, slice 3).
//!
//! Wire shapes only: the `RunSupervisor`, the use case, `commands.rs`, the
//! provider adapters and the six-kind emission live in #19. Rust fields stay
//! `snake_case`; `#[serde(rename_all = "camelCase")]` emits the JSON the
//! TypeScript contract and the shared fixtures pin.
//!
//! The tool-activity frame reuses the conversation [`ToolCallDto`] instead of
//! defining a second copy of the same product entity. A module that needs to
//! expose an API across modules does so through its public `dto` module
//! (`docs/research-tecnico/arquitectura-tauri.md`, "Estructura de archivos").

use crate::features::conversations::dto::ToolCallDto;
use crate::ipc::error::AppErrorDto;
use serde::{Deserialize, Serialize};

/// Lifecycle state of a run.
///
/// `started` is a stream frame kind, not a status: a run that has emitted
/// `started` is [`RunStatusDto::Streaming`], and is [`RunStatusDto::Pending`]
/// before the first frame (`.claude/knowledge/business-logic.md` §3.2). The
/// set is closed and #19 owns the transitions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunStatusDto {
    Pending,
    Streaming,
    Completed,
    Failed,
    Cancelled,
}

/// Where a run executes, as chosen in the composer environment popover.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunEnvironmentDto {
    /// Run in a fresh git worktree instead of the current checkout.
    pub use_new_worktree: bool,
    /// Branch selected from the project's own repository branch list.
    pub git_branch: String,
    pub environment_name: String,
}

/// The authoritative run snapshot every run command returns.
///
/// `get_run` reads the same shape for snapshot-on-reopen; the richer snapshot
/// payload (accumulated text and tool activity) is a #19 decision.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunDto {
    pub run_id: String,
    pub conversation_id: String,
    pub project_id: String,
    pub status: RunStatusDto,
}

/// Request envelope for `start_run`.
///
/// Carries no `approval_mode`: the tool approval policy is project-scoped and
/// resolved in the Rust core, never trusted from the UI
/// (`.opencode/knowledge/critical-constraints.md` §7). `project_id` is
/// authority-bearing; #19 enforces `conversation.projectId == project_id`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StartRunRequestDto {
    pub conversation_id: String,
    pub project_id: String,
    pub provider_id: String,
    pub model_id: String,
    pub effort_level: String,
    pub prompt: String,
    pub environment: RunEnvironmentDto,
}

/// Request envelope for `cancel_run`; `run_id` is the authority token.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CancelRunRequestDto {
    pub run_id: String,
}

/// Request envelope for `get_run`; the snapshot-on-reopen read.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GetRunRequestDto {
    pub run_id: String,
}

/// One incremental frame of a run's `Channel` stream.
///
/// Internally tagged by `kind`; every frame carries `runId` and a monotonic
/// `seq` so a consumer can order frames and drop stale ones
/// (`.claude/rules/ipc-and-contracts.md` §5). The union is closed at the
/// normative six kinds; `hookReviewRequired` is deliberately absent and #20
/// must amend the contract if it needs a push frame.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum RunStreamEventDto {
    Started {
        run_id: String,
        seq: u64,
    },
    TextDelta {
        run_id: String,
        seq: u64,
        text: String,
    },
    ToolActivity {
        run_id: String,
        seq: u64,
        tool_call: ToolCallDto,
    },
    Completed {
        run_id: String,
        seq: u64,
    },
    Failed {
        run_id: String,
        seq: u64,
        error: AppErrorDto,
    },
    Cancelled {
        run_id: String,
        seq: u64,
    },
}
