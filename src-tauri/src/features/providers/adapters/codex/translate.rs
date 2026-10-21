//! Codex `exec --json` events → domain run progress (issue #26).
//!
//! A pure state machine, independent of the child process, so the frame
//! mapping is unit tested without spawning anything. It produces exactly the
//! progress the fake runner produces — `text_delta` and `tool_activity` — and
//! a single outcome; the supervisor still owns `started` and the terminal
//! frames.
//!
//! Mapping:
//!
//! - `agent_message` (completed) → `text_delta`. `codex exec --json` emits
//!   whole messages, not token deltas; consecutive messages are separated by
//!   a blank line.
//! - `command_execution`, `file_change`, `mcp_tool_call`, `web_search` →
//!   `tool_activity` keyed by the item id: `running` when started/updated,
//!   then `completed` / `failed`. The UI upserts by id, so one row updates.
//! - `reasoning`, `todo_list`, item-level `error` notices, lifecycle events
//!   and unknown types are not surfaced.
//! - `turn.completed` completes the run; `turn.failed` fails it with a
//!   classified, fixed message. A top-level `error` notice is remembered so a
//!   later non-zero exit can be classified, but it does not end the run.

use super::errors::turn_failure;
use super::wire::{ThreadEvent, WireItem};
use crate::features::conversations::domain::{ToolCall, ToolCallKind, ToolCallStatus};
use crate::features::runs::domain::RunFailure;

/// Largest detail text kept for an activity row.
pub const MAX_DETAIL_BYTES: usize = 4 * 1024;

/// Largest summary subject (command, tool, query) kept for an activity row.
const MAX_SUBJECT_CHARS: usize = 120;

/// Largest vendor item id kept as the tool-call id.
const MAX_ITEM_ID_CHARS: usize = 128;

/// What one event asks the adapter to forward.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Translation {
    Skip,
    Text(String),
    Tool(ToolCall),
    /// The turn reached its outcome; stop reading.
    Finished(Result<(), RunFailure>),
}

/// Per-run translation state.
#[derive(Debug, Default)]
pub struct EventTranslator {
    emitted_text: bool,
    last_error: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Phase {
    Active,
    Completed,
}

impl EventTranslator {
    pub fn new() -> Self {
        Self::default()
    }

    /// The last top-level `error` notice, for classifying an abnormal exit.
    /// Inspected only; never forwarded.
    pub fn last_error(&self) -> Option<&str> {
        self.last_error.as_deref()
    }

    pub fn apply(&mut self, event: ThreadEvent) -> Translation {
        match event {
            ThreadEvent::ItemStarted { item } | ThreadEvent::ItemUpdated { item } => {
                tool_translation(&item, Phase::Active)
            }
            ThreadEvent::ItemCompleted { item } => {
                if item.kind == "agent_message" {
                    self.text_translation(item.text.unwrap_or_default())
                } else {
                    tool_translation(&item, Phase::Completed)
                }
            }
            ThreadEvent::TurnCompleted {} => Translation::Finished(Ok(())),
            ThreadEvent::TurnFailed { error } => Translation::Finished(Err(turn_failure(
                error.as_ref().and_then(|error| error.message.as_deref()),
            ))),
            ThreadEvent::Error { message } => {
                if let Some(message) = message {
                    self.last_error = Some(truncate_bytes(&message, MAX_DETAIL_BYTES));
                }
                Translation::Skip
            }
            ThreadEvent::ThreadStarted {} | ThreadEvent::TurnStarted {} | ThreadEvent::Unknown => {
                Translation::Skip
            }
        }
    }

    fn text_translation(&mut self, text: String) -> Translation {
        if text.is_empty() {
            return Translation::Skip;
        }
        if self.emitted_text {
            Translation::Text(format!("\n\n{text}"))
        } else {
            self.emitted_text = true;
            Translation::Text(text)
        }
    }
}

fn tool_translation(item: &WireItem, phase: Phase) -> Translation {
    let (kind, summary, detail) = match item.kind.as_str() {
        "command_execution" => {
            let command = item.command.clone().unwrap_or_default();
            let detail = match (&item.aggregated_output, phase) {
                (Some(output), Phase::Completed) if !output.is_empty() => {
                    format!("{command}\n\n{output}")
                }
                _ => command.clone(),
            };
            (
                ToolCallKind::Command,
                format!("Ran command: {}", subject(&command)),
                detail,
            )
        }
        "file_change" => {
            let paths: Vec<&str> = item
                .changes
                .iter()
                .flatten()
                .map(|change| change.path.as_str())
                .collect();
            let detail = item
                .changes
                .iter()
                .flatten()
                .map(|change| {
                    format!(
                        "{} {}",
                        change.kind.as_deref().unwrap_or("update"),
                        change.path
                    )
                })
                .collect::<Vec<String>>()
                .join("\n");
            (
                ToolCallKind::Diff,
                format!("Edited files: {}", subject(&paths.join(", "))),
                detail,
            )
        }
        "mcp_tool_call" => {
            let name = format!(
                "{}/{}",
                item.server.as_deref().unwrap_or_default(),
                item.tool.as_deref().unwrap_or_default()
            );
            let detail = item
                .arguments
                .as_ref()
                .map(|arguments| arguments.to_string())
                .unwrap_or_default();
            (
                ToolCallKind::Command,
                format!("Called tool: {}", subject(&name)),
                detail,
            )
        }
        "web_search" => {
            let query = item.query.clone().unwrap_or_default();
            (
                ToolCallKind::Search,
                format!("Searched the web: {}", subject(&query)),
                query,
            )
        }
        _ => return Translation::Skip,
    };
    Translation::Tool(ToolCall {
        id: item.id.chars().take(MAX_ITEM_ID_CHARS).collect(),
        kind,
        summary,
        detail: truncate_bytes(&detail, MAX_DETAIL_BYTES),
        status: status(item, phase),
        subagent_id: None,
    })
}

fn status(item: &WireItem, phase: Phase) -> ToolCallStatus {
    match item.status.as_deref() {
        Some("failed" | "declined") => ToolCallStatus::Failed,
        Some("completed") if item.exit_code.is_some_and(|code| code != 0) => ToolCallStatus::Failed,
        Some("completed") => ToolCallStatus::Completed,
        _ if phase == Phase::Completed => {
            if item.exit_code.is_some_and(|code| code != 0) {
                ToolCallStatus::Failed
            } else {
                ToolCallStatus::Completed
            }
        }
        _ => ToolCallStatus::Running,
    }
}

/// One-line, bounded summary subject.
fn subject(text: &str) -> String {
    let line = text.lines().next().unwrap_or_default();
    let mut subject: String = line.chars().take(MAX_SUBJECT_CHARS).collect();
    if line.chars().count() > MAX_SUBJECT_CHARS || text.lines().nth(1).is_some() {
        subject.push('…');
    }
    subject
}

/// Truncates to at most `limit` bytes without splitting a character.
fn truncate_bytes(text: &str, limit: usize) -> String {
    if text.len() <= limit {
        return text.to_owned();
    }
    let mut cut = limit;
    while cut > 0 && !text.is_char_boundary(cut) {
        cut -= 1;
    }
    text[..cut].to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::runs::domain::RunFailureCode;

    fn event(json: &str) -> ThreadEvent {
        serde_json::from_str(json).expect("test event decodes")
    }

    fn run(script: &[&str]) -> Vec<Translation> {
        let mut translator = EventTranslator::new();
        script
            .iter()
            .map(|json| translator.apply(event(json)))
            .filter(|translation| *translation != Translation::Skip)
            .collect()
    }

    #[test]
    fn maps_a_text_turn_to_deltas_and_completion() {
        let translations = run(&[
            r#"{"type":"thread.started","thread_id":"t"}"#,
            r#"{"type":"turn.started"}"#,
            r#"{"type":"item.completed","item":{"id":"item_0","type":"reasoning","text":"thinking"}}"#,
            r#"{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"Hello"}}"#,
            r#"{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"World"}}"#,
            r#"{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}"#,
        ]);
        assert_eq!(
            translations,
            vec![
                Translation::Text("Hello".to_owned()),
                Translation::Text("\n\nWorld".to_owned()),
                Translation::Finished(Ok(())),
            ]
        );
    }

    #[test]
    fn command_items_become_one_upserted_activity_row() {
        let translations = run(&[
            r#"{"type":"item.started","item":{"id":"item_3","type":"command_execution","command":"bash -lc ls","aggregated_output":"","status":"in_progress"}}"#,
            r#"{"type":"item.completed","item":{"id":"item_3","type":"command_execution","command":"bash -lc ls","aggregated_output":"src\n","exit_code":0,"status":"completed"}}"#,
        ]);
        assert_eq!(
            translations,
            vec![
                Translation::Tool(ToolCall {
                    id: "item_3".to_owned(),
                    kind: ToolCallKind::Command,
                    summary: "Ran command: bash -lc ls".to_owned(),
                    detail: "bash -lc ls".to_owned(),
                    status: ToolCallStatus::Running,
                    subagent_id: None,
                }),
                Translation::Tool(ToolCall {
                    id: "item_3".to_owned(),
                    kind: ToolCallKind::Command,
                    summary: "Ran command: bash -lc ls".to_owned(),
                    detail: "bash -lc ls\n\nsrc\n".to_owned(),
                    status: ToolCallStatus::Completed,
                    subagent_id: None,
                }),
            ]
        );
    }

    #[test]
    fn failed_or_declined_commands_are_failed_rows() {
        for json in [
            r#"{"type":"item.completed","item":{"id":"a","type":"command_execution","command":"x","exit_code":1,"status":"completed"}}"#,
            r#"{"type":"item.completed","item":{"id":"b","type":"command_execution","command":"x","status":"failed"}}"#,
            r#"{"type":"item.completed","item":{"id":"c","type":"command_execution","command":"x","status":"declined"}}"#,
        ] {
            match run(&[json]).as_slice() {
                [Translation::Tool(tool)] => assert_eq!(tool.status, ToolCallStatus::Failed),
                other => panic!("unexpected {other:?}"),
            }
        }
    }

    #[test]
    fn file_changes_searches_and_mcp_calls_are_activity() {
        let translations = run(&[
            r#"{"type":"item.completed","item":{"id":"f","type":"file_change","changes":[{"path":"src/a.rs","kind":"update"},{"path":"b.md","kind":"add"}],"status":"completed"}}"#,
            r#"{"type":"item.started","item":{"id":"w","type":"web_search","query":"tokio process group"}}"#,
            r#"{"type":"item.completed","item":{"id":"m","type":"mcp_tool_call","server":"docs","tool":"search","arguments":{"q":"x"},"status":"completed"}}"#,
        ]);
        let tools: Vec<(ToolCallKind, String, ToolCallStatus)> = translations
            .into_iter()
            .map(|translation| match translation {
                Translation::Tool(tool) => (tool.kind, tool.summary, tool.status),
                other => panic!("unexpected {other:?}"),
            })
            .collect();
        assert_eq!(
            tools,
            vec![
                (
                    ToolCallKind::Diff,
                    "Edited files: src/a.rs, b.md".to_owned(),
                    ToolCallStatus::Completed
                ),
                (
                    ToolCallKind::Search,
                    "Searched the web: tokio process group".to_owned(),
                    ToolCallStatus::Running
                ),
                (
                    ToolCallKind::Command,
                    "Called tool: docs/search".to_owned(),
                    ToolCallStatus::Completed
                ),
            ]
        );
    }

    #[test]
    fn todo_lists_item_errors_and_unknown_items_are_not_surfaced() {
        assert!(
            run(&[
                r#"{"type":"item.updated","item":{"id":"t","type":"todo_list","items":[{"text":"a","completed":false}]}}"#,
                r#"{"type":"item.completed","item":{"id":"e","type":"error","message":"warning"}}"#,
                r#"{"type":"item.completed","item":{"id":"n","type":"brand_new"}}"#,
                r#"{"type":"something.new"}"#,
            ])
            .is_empty()
        );
    }

    #[test]
    fn turn_failed_finishes_with_a_classified_failure() {
        match run(&[r#"{"type":"turn.failed","error":{"message":"401 Unauthorized"}}"#]).as_slice()
        {
            [Translation::Finished(Err(failure))] => {
                assert_eq!(failure.code, RunFailureCode::ProviderUnavailable);
                assert!(failure.message.contains("codex login"));
                assert!(!failure.message.contains("Unauthorized"));
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn error_notices_are_remembered_but_not_terminal() {
        let mut translator = EventTranslator::new();
        assert_eq!(
            translator.apply(event(r#"{"type":"error","message":"Reconnecting... 1/5"}"#)),
            Translation::Skip
        );
        assert_eq!(translator.last_error(), Some("Reconnecting... 1/5"));
    }

    #[test]
    fn details_and_summaries_are_bounded() {
        let long = "é".repeat(MAX_DETAIL_BYTES);
        let json = serde_json::json!({
            "type": "item.completed",
            "item": {"id": "x", "type": "command_execution", "command": long, "status": "completed"}
        })
        .to_string();
        match run(&[json.as_str()]).as_slice() {
            [Translation::Tool(tool)] => {
                assert!(tool.detail.len() <= MAX_DETAIL_BYTES);
                assert!(
                    tool.summary.chars().count() <= "Ran command: ".len() + MAX_SUBJECT_CHARS + 1
                );
            }
            other => panic!("unexpected {other:?}"),
        }
    }
}
