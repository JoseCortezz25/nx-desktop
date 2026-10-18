//! Workspace read wire DTOs (issue #16, slice 4).
//!
//! Wire shapes only: the `read_file` use case, `commands.rs`, the path policy
//! and the filesystem adapter live in #21. Rust fields stay `snake_case`;
//! `#[serde(rename_all = "camelCase")]` emits the JSON the TypeScript contract
//! and the shared fixture pin.
//!
//! `project_id` is authority-bearing and `path` is workspace-relative. The DTO
//! is not enforcement: #21 canonicalizes the project roots and rejects `..`,
//! symlink escapes and absolute paths outside the workspace before reading
//! (`.claude/knowledge/business-logic.md` §3.3).

use serde::{Deserialize, Serialize};

/// Request envelope for `read_file`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReadFileRequestDto {
    pub project_id: String,
    pub path: String,
}

/// One workspace file as read through the port.
///
/// The command resolves `Option<FileDocumentDto>`: `None` serializes to `null`
/// when the path holds no document, matching `FileRepository.readDocument`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDocumentDto {
    pub path: String,
    pub content: String,
}
