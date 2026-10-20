//! Conversation catalog DTOs (issue #16, slice 2).
//!
//! Wire shapes only: the service, command and persistence live in #18. Closed
//! enums keep `snake_case` values aligned with the TypeScript domain unions; an
//! absent optional field stays absent on the wire so fixtures round-trip.

use serde::{Deserialize, Serialize};

use super::domain::{ToolCall, ToolCallKind, ToolCallStatus};

/// Who authored a conversation message.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MessageRoleDto {
    User,
    Assistant,
    System,
}

/// The kind of tool that ran (`search`, `command`, `list_files`, ...).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolCallKindDto {
    Search,
    Command,
    ListFiles,
    Diff,
    Subagent,
}

/// Lifecycle of a single tool invocation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolCallStatusDto {
    Pending,
    Running,
    Completed,
    Failed,
}

/// A file a message points at inline; the chip only asks to open it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileReferenceDto {
    pub path: String,
}

/// A tool invocation surfaced inside a conversation message.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallDto {
    pub id: String,
    pub kind: ToolCallKindDto,
    pub summary: String,
    pub detail: String,
    pub status: ToolCallStatusDto,
    /// Child run opened by a subagent activity row; absent for other tools.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subagent_id: Option<String>,
}

/// One turn in a conversation, optionally carrying tool activity.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationMessageDto {
    pub id: String,
    pub role: MessageRoleDto,
    pub content: String,
    pub created_at: String,
    pub tool_calls: Vec<ToolCallDto>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_references: Option<Vec<FileReferenceDto>>,
}

/// A conversation as listed in the sidebar and opened in the main pane.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationDto {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub messages: Vec<ConversationMessageDto>,
    pub is_pinned: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// Request envelope for `create_conversation`; the core derives a title if absent.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateConversationRequestDto {
    pub project_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}

/// Projects the conversation domain entity onto the one wire shape every
/// feature shares for tool activity.
///
/// The run stream's `toolActivity` frame reuses this same DTO, so the mapping
/// lives here — with the shape it produces — instead of being copied in
/// `runs/commands.rs` where the two copies could drift
/// (`docs/research-tecnico/arquitectura-tauri.md`, "Estructura de archivos":
/// expose what crosses a module from the module itself).
pub fn to_tool_call_dto(tool_call: &ToolCall) -> ToolCallDto {
    ToolCallDto {
        id: tool_call.id.clone(),
        kind: match tool_call.kind {
            ToolCallKind::Search => ToolCallKindDto::Search,
            ToolCallKind::Command => ToolCallKindDto::Command,
            ToolCallKind::ListFiles => ToolCallKindDto::ListFiles,
            ToolCallKind::Diff => ToolCallKindDto::Diff,
            ToolCallKind::Subagent => ToolCallKindDto::Subagent,
        },
        summary: tool_call.summary.clone(),
        detail: tool_call.detail.clone(),
        status: match tool_call.status {
            ToolCallStatus::Pending => ToolCallStatusDto::Pending,
            ToolCallStatus::Running => ToolCallStatusDto::Running,
            ToolCallStatus::Completed => ToolCallStatusDto::Completed,
            ToolCallStatus::Failed => ToolCallStatusDto::Failed,
        },
        subagent_id: tool_call.subagent_id.clone(),
    }
}
