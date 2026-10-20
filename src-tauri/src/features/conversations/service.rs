//! Conversation catalog use cases (issue #18).
//!
//! Owns the persisted conversation list. The store is synchronous and guarded
//! by a `std::sync::Mutex` with short lock scopes (clone under lock, drop the
//! guard, then compute), so no guard is ever held across `.await` by
//! construction — there is no async I/O in this issue.
//!
//! Timestamps come from an injectable [`Clock`]: tests pin a fixed reading so
//! created rows serialize deterministically, while production formats the
//! system time without new crates. Project membership (the Authority tier) is
//! validated by the caller against the `ProjectStore` before creation — this
//! service never invents a parent project.

use std::sync::Mutex;

use super::domain::{
    Conversation, ConversationError, ConversationId, ConversationTitle, DEFAULT_TITLE,
    FileReference, MessageRole, ToolCall, ToolCallKind, ToolCallStatus,
};

/// Source of creation timestamps, so tests pin time deterministically.
pub trait Clock: Send + Sync {
    fn now_iso(&self) -> String;
}

/// Fixed reading for tests and the contract-pinned creation fixture.
#[derive(Debug, Clone)]
pub struct FixedClock {
    now: String,
}

impl FixedClock {
    pub fn new(now: impl Into<String>) -> Self {
        Self { now: now.into() }
    }
}

impl Clock for FixedClock {
    fn now_iso(&self) -> String {
        self.now.clone()
    }
}

/// Production clock: formats the system time as ISO-8601 without new crates.
#[derive(Debug, Clone, Copy, Default)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now_iso(&self) -> String {
        format_system_time(std::time::SystemTime::now())
    }
}

/// Formats a `SystemTime` as `YYYY-MM-DDTHH:MM:SS.000Z` (days-from-epoch civil
/// date, Howard Hinnant's algorithm). Millis are pinned to `.000` — creation
/// timestamps need ordering, not sub-second precision, and this keeps the
/// formatter dependency-free.
fn format_system_time(time: std::time::SystemTime) -> String {
    let secs = time
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let days = secs.div_euclid(86_400);
    let time_of_day = secs.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.000Z",
        time_of_day / 3_600,
        (time_of_day % 3_600) / 60,
        time_of_day % 60
    )
}

/// Converts days since the Unix epoch to a civil (year, month, day) triple.
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let shifted = days + 719_468;
    let era = shifted.div_euclid(146_097);
    let day_of_era = shifted.rem_euclid(146_097);
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = (day_of_year - (153 * month_prime + 2) / 5 + 1) as u32;
    let month = if month_prime < 10 {
        month_prime + 3
    } else {
        month_prime - 9
    } as u32;
    (if month <= 2 { year + 1 } else { year }, month, day)
}

struct ConversationStoreInner {
    conversations: Vec<Conversation>,
    created_count: u32,
}

/// Long-lived owner of the conversation catalog.
pub struct ConversationStore {
    inner: Mutex<ConversationStoreInner>,
    clock: Box<dyn Clock>,
}

impl ConversationStore {
    /// Builds the store seeded from the frozen #16 fixture rows so service
    /// output matches the pinned wire shapes.
    pub fn seeded() -> Self {
        Self::with_clock(Box::new(SystemClock))
    }

    /// Builds a seeded store behind a caller-supplied clock (tests).
    pub fn with_clock(clock: Box<dyn Clock>) -> Self {
        Self {
            inner: Mutex::new(ConversationStoreInner {
                conversations: seed_conversations(),
                created_count: 0,
            }),
            clock,
        }
    }

    /// Every persisted conversation, seed order preserved.
    pub fn list_conversations(&self) -> Vec<Conversation> {
        // Short lock scope: clone under the guard, then drop it.
        self.inner
            .lock()
            .map(|inner| inner.conversations.clone())
            .unwrap_or_default()
    }

    /// Persists one conversation under an already-authorized project: assigns
    /// the next deterministic counter id, derives the title from the request
    /// or falls back to the contract default, and stamps both timestamps from
    /// the clock. The caller owns the Authority tier (project membership) and
    /// the post-creation attach to the `ProjectStore`.
    pub fn create_conversation(
        &self,
        project_id: &str,
        title: Option<ConversationTitle>,
    ) -> Result<Conversation, ConversationError> {
        if project_id.trim().is_empty() {
            return Err(ConversationError::EmptyProjectId);
        }
        let now = self.clock.now_iso();
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| ConversationError::UnknownProject {
                project_id: project_id.to_owned(),
            })?;
        inner.created_count += 1;
        let conversation = Conversation::new(
            // Static format string over a counter: infallible by construction.
            ConversationId::new(format!("conv-created-{}", inner.created_count))
                .unwrap_or_else(|_| unreachable_conversation_id(inner.created_count)),
            project_id.to_owned(),
            title.unwrap_or_else(|| {
                ConversationTitle::new(DEFAULT_TITLE)
                    .unwrap_or_else(|_| panic!("static default title must satisfy the Limits tier"))
            }),
            now,
        );
        inner.conversations.push(conversation.clone());
        Ok(conversation)
    }

    /// Removes one conversation by id; the rollback companion for a failed
    /// post-creation attach to the `ProjectStore`.
    pub fn remove_conversation(&self, id: &ConversationId) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.conversations.retain(|c| c.id != *id);
        }
    }
}

/// Fallback id when the deterministic counter format is rejected. The format
/// string is static and the counter is numeric, so this is unreachable; it
/// exists because `.expect()` is banned on all paths in this module.
fn unreachable_conversation_id(count: u32) -> ConversationId {
    ConversationId::new(format!("conv-fallback-{count}")).unwrap_or_else(|_| {
        // Static literal the constructor accepts: non-empty, far below the
        // length limit.
        ConversationId::new("conv-fallback").unwrap_or_else(|_| {
            panic!("static fallback conversation id must satisfy the Limits tier")
        })
    })
}

/// The frozen #16 fixture conversation
/// (`conversations-list-conversations.json`); note the mock repository carries
/// two extra conversations, but the fixture — the contract both suites pin —
/// carries exactly this one.
fn seed_conversations() -> Vec<Conversation> {
    vec![Conversation {
        // Static fixture id: a known-good literal, non-empty and short.
        id: ConversationId::new("conv-composer-chain").expect("fixture conversation id"),
        project_id: "proj-design-system".to_owned(),
        title: "Composer selection chain".to_owned(),
        messages: vec![
            super::domain::ConversationMessage {
                id: "msg-composer-1".to_owned(),
                role: MessageRole::User,
                content: "Reconcile the provider, model, and effort selectors.".to_owned(),
                created_at: "2026-10-01T09:00:05.000Z".to_owned(),
                tool_calls: Vec::new(),
                file_references: None,
            },
            super::domain::ConversationMessage {
                id: "msg-composer-2".to_owned(),
                role: MessageRole::Assistant,
                content: "Model ids are provider-scoped, so switching a provider resets the model."
                    .to_owned(),
                created_at: "2026-10-01T09:00:40.000Z".to_owned(),
                tool_calls: vec![
                    ToolCall {
                        id: "tool-composer-1".to_owned(),
                        kind: ToolCallKind::Search,
                        summary: "Searched src for the selection chain".to_owned(),
                        detail: "Matched selection-chain.ts and the composer organisms.".to_owned(),
                        status: ToolCallStatus::Completed,
                        subagent_id: None,
                    },
                    ToolCall {
                        id: "tool-composer-2".to_owned(),
                        kind: ToolCallKind::Subagent,
                        summary: "Subagent Inspect repo completed".to_owned(),
                        detail: "Open the repository inspection child run.".to_owned(),
                        status: ToolCallStatus::Completed,
                        subagent_id: Some("subagent-inspect-repo".to_owned()),
                    },
                ],
                file_references: Some(vec![FileReference {
                    path: "src/shared/domain/selection-chain.ts".to_owned(),
                }]),
            },
        ],
        is_pinned: true,
        created_at: "2026-10-01T09:00:00.000Z".to_owned(),
        updated_at: "2026-10-14T16:30:00.000Z".to_owned(),
    }]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> ConversationStore {
        ConversationStore::with_clock(Box::new(FixedClock::new("2026-10-18T12:00:00.000Z")))
    }

    #[test]
    fn lists_the_fixture_conversation() {
        let conversations = store().list_conversations();
        assert_eq!(conversations.len(), 1);
        assert_eq!(conversations[0].id.as_str(), "conv-composer-chain");
        assert_eq!(conversations[0].messages.len(), 2);
    }

    #[test]
    fn creates_a_conversation_with_the_request_title() {
        let store = store();
        let conversation = store
            .create_conversation(
                "proj-design-system",
                Some(ConversationTitle::new("IPC contract review").expect("title")),
            )
            .expect("creation succeeds");
        assert_eq!(conversation.id.as_str(), "conv-created-1");
        assert_eq!(conversation.project_id, "proj-design-system");
        assert_eq!(conversation.title, "IPC contract review");
        assert!(conversation.messages.is_empty());
        assert!(!conversation.is_pinned);
        assert_eq!(conversation.created_at, "2026-10-18T12:00:00.000Z");
        assert_eq!(conversation.created_at, conversation.updated_at);
    }

    #[test]
    fn derives_the_default_title_when_absent() {
        let store = store();
        let conversation = store
            .create_conversation("proj-design-system", None)
            .expect("creation succeeds");
        assert_eq!(conversation.title, DEFAULT_TITLE);
    }

    #[test]
    fn rejects_a_blank_project_id() {
        let store = store();
        assert_eq!(
            store
                .create_conversation("  ", None)
                .expect_err("blank project id"),
            ConversationError::EmptyProjectId
        );
    }

    #[test]
    fn removes_a_conversation_for_attach_rollback() {
        let store = store();
        let conversation = store
            .create_conversation("proj-design-system", None)
            .expect("creation succeeds");
        let id = ConversationId::new(conversation.id.as_str()).expect("id");
        store.remove_conversation(&id);
        assert_eq!(store.list_conversations().len(), 1);
    }

    #[test]
    fn system_clock_formats_a_known_instant() {
        let time = std::time::UNIX_EPOCH + std::time::Duration::from_secs(1_760_000_000);
        assert_eq!(format_system_time(time), "2025-10-09T08:53:20.000Z");
    }
}
