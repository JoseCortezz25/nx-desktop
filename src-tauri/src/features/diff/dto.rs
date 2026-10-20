//! Workspace diff wire DTOs (issue #16, slice 4).
//!
//! Wire shapes only: the `read_workspace_diff` use case, the git adapter and
//! command registration live in #21. Rust fields stay `snake_case`;
//! `#[serde(rename_all = "camelCase")]` emits the JSON the TypeScript contract
//! and the shared fixture pin.
//!
//! `project_id` is authority-bearing: #21 resolves it to the project's
//! canonicalized workspace roots before inspecting the change set
//! (`.claude/knowledge/business-logic.md` §3.3).

use serde::{Deserialize, Serialize};

/// How a unified diff line relates to the previous revision.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DiffLineKindDto {
    Context,
    Added,
    Removed,
}

/// One line of a unified diff hunk.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffLineDto {
    pub kind: DiffLineKindDto,
    pub content: String,
}

/// One `@@` hunk of a changed file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffHunkDto {
    pub header: String,
    pub lines: Vec<DiffLineDto>,
}

/// One changed file, in the order the right panel draws it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffFileDto {
    pub path: String,
    pub added_count: u32,
    pub removed_count: u32,
    pub hunks: Vec<DiffHunkDto>,
}

/// Request envelope for `read_workspace_diff`; authority-bearing.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReadWorkspaceDiffRequestDto {
    pub project_id: String,
}
