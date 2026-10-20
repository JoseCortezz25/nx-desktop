//! Conversation catalog commands (issue #18).
//!
//! Thin input adapters: validate the boundary (Shape via Serde, Limits via the
//! domain constructors, Invariants and Authority via the stores), invoke the
//! use case, and map failures to [`AppErrorDto`]. No business rules live here.
//!
//! Creation is a two-store write: the conversation is persisted first, then
//! attached to its project. When the attach fails (the project vanished
//! between the two steps), the conversation row is rolled back so no orphan
//! survives.

use std::sync::atomic::{AtomicU64, Ordering};

use tauri::State;

use super::domain::{Conversation, ConversationError, ConversationTitle, MessageRole};
use super::dto::{
    ConversationDto, ConversationMessageDto, CreateConversationRequestDto, FileReferenceDto,
    MessageRoleDto, to_tool_call_dto,
};
use super::service::ConversationStore;
use crate::features::projects::domain::{ProjectError, ProjectId};
use crate::features::projects::service::ProjectStore;
use crate::ipc::error::{AppErrorCode, AppErrorDto};

/// Monotonic suffix for command correlation ids (`req-<n>`).
static REQUEST_SEQ: AtomicU64 = AtomicU64::new(1);

fn request_id() -> String {
    format!("req-{}", REQUEST_SEQ.fetch_add(1, Ordering::Relaxed))
}

fn validation_error(error: ConversationError) -> AppErrorDto {
    let message = match &error {
        ConversationError::EmptyConversationId => "conversationId must not be empty".to_owned(),
        ConversationError::IdTooLong { len } => {
            format!("conversationId exceeds the maximum accepted size ({len} bytes)")
        }
        ConversationError::EmptyTitle => "title must not be empty".to_owned(),
        ConversationError::TitleTooLong { len } => {
            format!("title exceeds the maximum accepted size ({len} bytes)")
        }
        ConversationError::EmptyProjectId => "projectId must not be empty".to_owned(),
        // Unreachable from the validation-only paths below; kept so the match
        // stays exhaustive over the domain error.
        ConversationError::UnknownProject { project_id } => {
            format!("unknown project: {project_id}")
        }
        ConversationError::PersistenceFailed => "conversation could not be persisted".to_owned(),
    };
    AppErrorDto::new(AppErrorCode::ValidationFailed, message, request_id())
}

fn internal_error(message: &str) -> AppErrorDto {
    AppErrorDto::new(
        AppErrorCode::InternalError,
        message.to_owned(),
        request_id(),
    )
}

fn authority_error(project_id: String) -> AppErrorDto {
    AppErrorDto::new(
        AppErrorCode::PermissionDenied,
        format!("unknown project: {project_id}"),
        request_id(),
    )
}

fn to_conversation_dto(conversation: &Conversation) -> ConversationDto {
    ConversationDto {
        id: conversation.id.as_str().to_owned(),
        project_id: conversation.project_id.clone(),
        title: conversation.title.clone(),
        messages: conversation
            .messages
            .iter()
            .map(|message| ConversationMessageDto {
                id: message.id.clone(),
                role: match message.role {
                    MessageRole::User => MessageRoleDto::User,
                    MessageRole::Assistant => MessageRoleDto::Assistant,
                    MessageRole::System => MessageRoleDto::System,
                },
                content: message.content.clone(),
                created_at: message.created_at.clone(),
                tool_calls: message.tool_calls.iter().map(to_tool_call_dto).collect(),
                file_references: message.file_references.as_ref().map(|references| {
                    references
                        .iter()
                        .map(|reference| FileReferenceDto {
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

/// Lists every persisted conversation.
#[tauri::command]
pub fn list_conversations(
    store: State<'_, ConversationStore>,
) -> Result<Vec<ConversationDto>, AppErrorDto> {
    Ok(store
        .list_conversations()
        .iter()
        .map(to_conversation_dto)
        .collect())
}

/// Creates one conversation in an authorized project; the core derives the
/// title when the request omits it. An unknown project is denied authority,
/// and a failed project attach rolls the conversation row back.
#[tauri::command]
pub fn create_conversation(
    conversations: State<'_, ConversationStore>,
    projects: State<'_, ProjectStore>,
    request: CreateConversationRequestDto,
) -> Result<ConversationDto, AppErrorDto> {
    let project_id = ProjectId::new(request.project_id.clone())
        .map_err(|_| authority_error(request.project_id.clone()))?;
    if !projects.contains(&project_id) {
        return Err(authority_error(request.project_id.clone()));
    }
    let title = request
        .title
        .map(ConversationTitle::new)
        .transpose()
        .map_err(validation_error)?;
    let conversation = conversations
        .create_conversation(project_id.as_str(), title)
        .map_err(|error| match error {
            ConversationError::PersistenceFailed => {
                internal_error("conversation could not be persisted")
            }
            other => validation_error(other),
        })?;
    if let Err(error) = projects.attach_conversation(&project_id, conversation.id.as_str()) {
        let rollback_id = super::domain::ConversationId::new(conversation.id.as_str())
            .map_err(validation_error)?;
        let _ = conversations.remove_conversation(&rollback_id);
        return Err(match error {
            ProjectError::PersistenceFailed => internal_error("project could not be persisted"),
            _ => authority_error(project_id.as_str().to_owned()),
        });
    }
    Ok(to_conversation_dto(&conversation))
}

#[cfg(test)]
mod tests {
    use super::super::service::{FixedClock, SystemClock};
    use super::*;

    fn stores() -> (ConversationStore, ProjectStore) {
        (
            ConversationStore::with_clock(Box::new(FixedClock::new("2026-10-18T12:00:00.000Z"))),
            ProjectStore::seeded(),
        )
    }

    #[test]
    fn registry_output_matches_the_pinned_fixture() {
        let raw =
            include_str!("../../../../docs/ipc/fixtures/conversations-list-conversations.json");
        // Fixture file is valid JSON; a parse failure means the contract moved.
        let fixture: serde_json::Value =
            serde_json::from_str(raw).expect("conversation fixture parses");
        let expected: Vec<ConversationDto> = serde_json::from_value(fixture["response"].clone())
            .expect("fixture response deserializes");
        let (conversations, _) = stores();
        let actual: Vec<ConversationDto> = conversations
            .list_conversations()
            .iter()
            .map(to_conversation_dto)
            .collect();
        assert_eq!(actual, expected);
    }

    #[test]
    fn created_conversation_matches_the_pinned_fixture() {
        let raw =
            include_str!("../../../../docs/ipc/fixtures/conversations-create-conversation.json");
        let fixture: serde_json::Value =
            serde_json::from_str(raw).expect("creation fixture parses");
        let expected: ConversationDto = serde_json::from_value(fixture["response"].clone())
            .expect("fixture response deserializes");
        let (conversations, _) = stores();
        let created = conversations
            .create_conversation(
                "proj-design-system",
                Some(ConversationTitle::new("IPC contract review").expect("title")),
            )
            .expect("creation succeeds");
        assert_eq!(to_conversation_dto(&created), expected);
    }

    #[test]
    fn unknown_project_is_denied_authority() {
        let error = authority_error("proj-ghost".to_owned());
        assert_eq!(error.code, AppErrorCode::PermissionDenied);
        assert!(!error.retryable);
        assert!(error.request_id.starts_with("req-"));
    }

    #[test]
    fn system_clock_is_available_for_production() {
        let _ = SystemClock;
    }
}
