//! Conversation store persistence (issue #22).
//!
//! A versioned JSON record per conversation, including messages, tool activity
//! and inline file references, mapped to/from the domain. The store calls
//! these helpers under its short lock; the document is small and synchronous.

use serde::{Deserialize, Serialize};

use super::domain::{
    Conversation, ConversationId, ConversationMessage, FileReference, MessageRole, ToolCall,
    ToolCallKind, ToolCallStatus,
};
use crate::persistence::{JsonPersistence, PersistenceError};

const FORMAT_VERSION: u32 = 1;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConversationsFile {
    version: u32,
    conversations: Vec<PersistedConversation>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedConversation {
    id: String,
    project_id: String,
    title: String,
    messages: Vec<PersistedMessage>,
    is_pinned: bool,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedMessage {
    id: String,
    role: PersistedMessageRole,
    content: String,
    created_at: String,
    tool_calls: Vec<PersistedToolCall>,
    #[serde(skip_serializing_if = "Option::is_none")]
    file_references: Option<Vec<PersistedFileReference>>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum PersistedMessageRole {
    User,
    Assistant,
    System,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedToolCall {
    id: String,
    kind: PersistedToolCallKind,
    summary: String,
    detail: String,
    status: PersistedToolCallStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    subagent_id: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum PersistedToolCallKind {
    Search,
    Command,
    ListFiles,
    Diff,
    Subagent,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum PersistedToolCallStatus {
    Pending,
    Running,
    Completed,
    Failed,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedFileReference {
    path: String,
}

/// Loads the persisted conversation catalog, or `None` when the file is absent.
pub(super) fn load(
    persistence: &JsonPersistence,
) -> Result<Option<Vec<Conversation>>, PersistenceError> {
    let Some(file) = persistence.load::<ConversationsFile>()? else {
        return Ok(None);
    };
    if file.version != FORMAT_VERSION {
        return Err(PersistenceError::UnsupportedVersion {
            found: file.version,
            expected: FORMAT_VERSION,
        });
    }
    let conversations = file
        .conversations
        .into_iter()
        .map(to_domain)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Some(conversations))
}

/// Writes the full conversation catalog.
pub(super) fn save(
    persistence: &JsonPersistence,
    conversations: &[Conversation],
) -> Result<(), PersistenceError> {
    persistence.save(&ConversationsFile {
        version: FORMAT_VERSION,
        conversations: conversations.iter().map(from_domain).collect(),
    })
}

fn to_domain(record: PersistedConversation) -> Result<Conversation, PersistenceError> {
    Ok(Conversation {
        id: ConversationId::new(record.id).map_err(|_| PersistenceError::InvalidData {
            field: "conversations[].id",
        })?,
        project_id: record.project_id,
        title: record.title,
        messages: record
            .messages
            .into_iter()
            .map(|message| ConversationMessage {
                id: message.id,
                role: match message.role {
                    PersistedMessageRole::User => MessageRole::User,
                    PersistedMessageRole::Assistant => MessageRole::Assistant,
                    PersistedMessageRole::System => MessageRole::System,
                },
                content: message.content,
                created_at: message.created_at,
                tool_calls: message
                    .tool_calls
                    .into_iter()
                    .map(|tool_call| ToolCall {
                        id: tool_call.id,
                        kind: match tool_call.kind {
                            PersistedToolCallKind::Search => ToolCallKind::Search,
                            PersistedToolCallKind::Command => ToolCallKind::Command,
                            PersistedToolCallKind::ListFiles => ToolCallKind::ListFiles,
                            PersistedToolCallKind::Diff => ToolCallKind::Diff,
                            PersistedToolCallKind::Subagent => ToolCallKind::Subagent,
                        },
                        summary: tool_call.summary,
                        detail: tool_call.detail,
                        status: match tool_call.status {
                            PersistedToolCallStatus::Pending => ToolCallStatus::Pending,
                            PersistedToolCallStatus::Running => ToolCallStatus::Running,
                            PersistedToolCallStatus::Completed => ToolCallStatus::Completed,
                            PersistedToolCallStatus::Failed => ToolCallStatus::Failed,
                        },
                        subagent_id: tool_call.subagent_id,
                    })
                    .collect(),
                file_references: message.file_references.map(|references| {
                    references
                        .into_iter()
                        .map(|reference| FileReference {
                            path: reference.path,
                        })
                        .collect()
                }),
            })
            .collect(),
        is_pinned: record.is_pinned,
        created_at: record.created_at,
        updated_at: record.updated_at,
    })
}

fn from_domain(conversation: &Conversation) -> PersistedConversation {
    PersistedConversation {
        id: conversation.id.as_str().to_owned(),
        project_id: conversation.project_id.clone(),
        title: conversation.title.clone(),
        messages: conversation
            .messages
            .iter()
            .map(|message| PersistedMessage {
                id: message.id.clone(),
                role: match message.role {
                    MessageRole::User => PersistedMessageRole::User,
                    MessageRole::Assistant => PersistedMessageRole::Assistant,
                    MessageRole::System => PersistedMessageRole::System,
                },
                content: message.content.clone(),
                created_at: message.created_at.clone(),
                tool_calls: message
                    .tool_calls
                    .iter()
                    .map(|tool_call| PersistedToolCall {
                        id: tool_call.id.clone(),
                        kind: match tool_call.kind {
                            ToolCallKind::Search => PersistedToolCallKind::Search,
                            ToolCallKind::Command => PersistedToolCallKind::Command,
                            ToolCallKind::ListFiles => PersistedToolCallKind::ListFiles,
                            ToolCallKind::Diff => PersistedToolCallKind::Diff,
                            ToolCallKind::Subagent => PersistedToolCallKind::Subagent,
                        },
                        summary: tool_call.summary.clone(),
                        detail: tool_call.detail.clone(),
                        status: match tool_call.status {
                            ToolCallStatus::Pending => PersistedToolCallStatus::Pending,
                            ToolCallStatus::Running => PersistedToolCallStatus::Running,
                            ToolCallStatus::Completed => PersistedToolCallStatus::Completed,
                            ToolCallStatus::Failed => PersistedToolCallStatus::Failed,
                        },
                        subagent_id: tool_call.subagent_id.clone(),
                    })
                    .collect(),
                file_references: message.file_references.as_ref().map(|references| {
                    references
                        .iter()
                        .map(|reference| PersistedFileReference {
                            path: reference.path.clone(),
                        })
                        .collect()
                }),
            })
            .collect(),
        is_pinned: conversation.is_pinned,
        created_at: conversation.created_at.clone(),
        updated_at: conversation.updated_at.clone(),
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;

    use super::*;

    fn temp_file(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "nx-conversations-{name}-{}.json",
            std::process::id()
        ))
    }

    fn conversation() -> Conversation {
        Conversation {
            id: ConversationId::new("conv-composer-chain").expect("fixture id"),
            project_id: "proj-design-system".to_owned(),
            title: "Composer selection chain".to_owned(),
            messages: vec![ConversationMessage {
                id: "msg-composer-2".to_owned(),
                role: MessageRole::Assistant,
                content: "Model ids are provider-scoped.".to_owned(),
                created_at: "2026-10-01T09:00:40.000Z".to_owned(),
                tool_calls: vec![ToolCall {
                    id: "tool-composer-1".to_owned(),
                    kind: ToolCallKind::Search,
                    summary: "Searched src".to_owned(),
                    detail: "Matched the selection chain.".to_owned(),
                    status: ToolCallStatus::Completed,
                    subagent_id: None,
                }],
                file_references: Some(vec![FileReference {
                    path: "src/shared/domain/selection-chain.ts".to_owned(),
                }]),
            }],
            is_pinned: true,
            created_at: "2026-10-01T09:00:00.000Z".to_owned(),
            updated_at: "2026-10-14T16:30:00.000Z".to_owned(),
        }
    }

    #[test]
    fn round_trips_conversations_with_messages_and_tool_calls() {
        let path = temp_file("round-trip");
        let persistence = JsonPersistence::new(&path);
        save(&persistence, &[conversation()]).expect("catalog saves");
        assert_eq!(
            load(&persistence).expect("catalog loads"),
            Some(vec![conversation()])
        );
        fs::remove_file(&path).expect("scratch cleanup");
    }

    #[test]
    fn a_missing_file_loads_as_none() {
        let path = temp_file("missing");
        let _ = fs::remove_file(&path);
        assert_eq!(
            load(&JsonPersistence::new(&path)).expect("missing is not an error"),
            None
        );
    }

    #[test]
    fn an_unsupported_version_is_rejected() {
        let path = temp_file("version");
        let persistence = JsonPersistence::new(&path);
        persistence
            .save(&serde_json::json!({ "version": 2, "conversations": [] }))
            .expect("fixture document");
        assert!(matches!(
            load(&persistence),
            Err(PersistenceError::UnsupportedVersion {
                found: 2,
                expected: 1
            })
        ));
        fs::remove_file(&path).expect("scratch cleanup");
    }

    #[test]
    fn an_invalid_conversation_id_is_rejected() {
        let path = temp_file("invalid");
        let persistence = JsonPersistence::new(&path);
        persistence
            .save(&serde_json::json!({
                "version": 1,
                "conversations": [{
                    "id": "  ",
                    "projectId": "proj-design-system",
                    "title": "Invalid",
                    "messages": [],
                    "isPinned": false,
                    "createdAt": "2026-10-01T09:00:00.000Z",
                    "updatedAt": "2026-10-01T09:00:00.000Z"
                }]
            }))
            .expect("fixture document");
        assert!(matches!(
            load(&persistence),
            Err(PersistenceError::InvalidData {
                field: "conversations[].id"
            })
        ));
        fs::remove_file(&path).expect("scratch cleanup");
    }
}
