//! Hook review wire DTOs (issue #16, slice 4).
//!
//! Wire shapes only: `list_hooks`, `set_hook_decision`, the hook policy, the
//! command registration and the approval enforcement live in #20. Rust fields
//! stay `snake_case`; `#[serde(rename_all = "camelCase")]` emits the JSON the
//! TypeScript contract and the shared fixtures pin.
//!
//! The decision about a hook is **project-scoped**
//! (`.claude/knowledge/business-logic.md` §2 `Hook`, decision 2026-10-16): both
//! requests carry `project_id` and neither carries a `run_id`, because a hook
//! the user declines is remembered per project and survives the run that
//! surfaced it. `HookApprovalStatusDto` is reused from the project catalog so a
//! `HookDto` status and a `ProjectDto.hookDecisions` status cannot drift.

use crate::features::projects::dto::HookApprovalStatusDto;
use serde::{Deserialize, Serialize};

/// A configured lifecycle hook as reviewed in the modal.
///
/// `hook_type` and `origin` stay open strings because they are provider data;
/// `approval_status` is the closed set the decision request writes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HookDto {
    pub id: String,
    pub name: String,
    pub is_new: bool,
    pub origin: String,
    pub hook_type: String,
    pub command: String,
    pub timeout_ms: u32,
    pub approval_status: HookApprovalStatusDto,
}

/// Request envelope for `list_hooks`; the project resolves its decisions.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ListHooksRequestDto {
    pub project_id: String,
}

/// Request envelope for `set_hook_decision`; authority-bearing.
///
/// `project_id` is the scope that remembers the decision and `hook_id` is the
/// reviewed hook's identity. #20 validates that the hook belongs to the project
/// before recording the closed `approval_status`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetHookDecisionRequestDto {
    pub project_id: String,
    pub hook_id: String,
    pub approval_status: HookApprovalStatusDto,
}
