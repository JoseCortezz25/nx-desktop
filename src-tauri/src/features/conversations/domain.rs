//! Conversation catalog domain (issue #18).
//!
//! Pure product rules for conversations: identities, title derivation input
//! validation and the message history shapes (`business-logic.md` §2). A
//! conversation owns its history and links back to its project by id, so
//! project data never duplicates it. No Tauri, no Serde wire attributes —
//! those live in `dto.rs` and `commands.rs` per the DTO ≠ Domain rule.

/// Maximum accepted length for conversation and message ids (Limits tier).
pub const MAX_ID_LEN: usize = 128;

/// Maximum accepted length for conversation titles (Limits tier).
pub const MAX_TITLE_LEN: usize = 256;

/// Core-derived title when the request omits one (contract-delegated default,
/// pinned by the service test; the UI may rename afterwards).
pub const DEFAULT_TITLE: &str = "New conversation";

/// Identity of a conversation (`conv-composer-chain`, `conv-created-1`, ...).
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ConversationId(String);

impl ConversationId {
    /// Builds an id, rejecting blank or overlong input at the Limits tier.
    pub fn new(id: impl Into<String>) -> Result<Self, ConversationError> {
        let id = id.into();
        if id.trim().is_empty() {
            return Err(ConversationError::EmptyConversationId);
        }
        if id.len() > MAX_ID_LEN {
            return Err(ConversationError::IdTooLong { len: id.len() });
        }
        Ok(Self(id))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// A validated conversation title; the normalized (trimmed) value is kept.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConversationTitle(String);

impl ConversationTitle {
    /// Builds a title, rejecting blank or overlong input at the Limits tier.
    pub fn new(title: impl Into<String>) -> Result<Self, ConversationError> {
        let title = title.into();
        let trimmed = title.trim();
        if trimmed.is_empty() {
            return Err(ConversationError::EmptyTitle);
        }
        if trimmed.len() > MAX_TITLE_LEN {
            return Err(ConversationError::TitleTooLong { len: trimmed.len() });
        }
        Ok(Self(trimmed.to_owned()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Who authored a conversation message.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MessageRole {
    User,
    Assistant,
    System,
}

/// The kind of tool that ran (`search`, `command`, `list_files`, ...).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolCallKind {
    Search,
    Command,
    ListFiles,
    Diff,
    Subagent,
}

/// Lifecycle of a single tool invocation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolCallStatus {
    Pending,
    Running,
    Completed,
    Failed,
}

/// A file a message points at inline; the chip only asks to open it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileReference {
    pub path: String,
}

/// A tool invocation surfaced inside a conversation message.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolCall {
    pub id: String,
    pub kind: ToolCallKind,
    pub summary: String,
    pub detail: String,
    pub status: ToolCallStatus,
    /// Child run opened by a subagent activity row; absent for other tools.
    pub subagent_id: Option<String>,
}

/// One turn in a conversation, optionally carrying tool activity.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConversationMessage {
    pub id: String,
    pub role: MessageRole,
    pub content: String,
    pub created_at: String,
    pub tool_calls: Vec<ToolCall>,
    pub file_references: Option<Vec<FileReference>>,
}

/// A conversation as listed in the sidebar and opened in the main pane.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Conversation {
    pub id: ConversationId,
    pub project_id: String,
    pub title: String,
    pub messages: Vec<ConversationMessage>,
    pub is_pinned: bool,
    pub created_at: String,
    pub updated_at: String,
}

impl Conversation {
    /// A freshly created conversation: no messages, unpinned, both timestamps
    /// at creation. The caller supplies the clock reading.
    pub fn new(
        id: ConversationId,
        project_id: String,
        title: ConversationTitle,
        now: String,
    ) -> Self {
        Self {
            id,
            project_id,
            title: title.as_str().to_owned(),
            messages: Vec::new(),
            is_pinned: false,
            created_at: now.clone(),
            updated_at: now,
        }
    }
}

/// The ways conversation validation can fail.
///
/// Kept free of IPC types on purpose: the service maps each variant to an
/// `AppErrorDto`, so this enum never decides wire codes itself.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConversationError {
    EmptyConversationId,
    IdTooLong { len: usize },
    EmptyTitle,
    TitleTooLong { len: usize },
    EmptyProjectId,
    UnknownProject { project_id: String },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_reject_blank_input() {
        assert_eq!(
            ConversationId::new("  ").expect_err("blank conversation id"),
            ConversationError::EmptyConversationId
        );
    }

    #[test]
    fn titles_accept_a_trimmed_value() {
        let title = ConversationTitle::new("  IPC contract review  ").expect("valid title");
        assert_eq!(title.as_str(), "IPC contract review");
    }

    #[test]
    fn titles_reject_blank_input() {
        assert_eq!(
            ConversationTitle::new("   ").expect_err("blank title"),
            ConversationError::EmptyTitle
        );
    }

    #[test]
    fn titles_reject_overlong_input() {
        let long = "t".repeat(MAX_TITLE_LEN + 1);
        assert_eq!(
            ConversationTitle::new(long).expect_err("overlong title"),
            ConversationError::TitleTooLong {
                len: MAX_TITLE_LEN + 1
            }
        );
    }

    #[test]
    fn new_conversations_start_empty_and_unpinned() {
        let conversation = Conversation::new(
            ConversationId::new("conv-created-1").expect("id"),
            "proj-design-system".to_owned(),
            ConversationTitle::new("IPC contract review").expect("title"),
            "2026-10-18T12:00:00.000Z".to_owned(),
        );
        assert!(conversation.messages.is_empty());
        assert!(!conversation.is_pinned);
        assert_eq!(conversation.created_at, conversation.updated_at);
    }
}
