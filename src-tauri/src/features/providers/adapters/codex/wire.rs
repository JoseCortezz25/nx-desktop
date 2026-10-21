//! Codex `exec --json` wire formats (issue #26).
//!
//! Vendor payloads only: one JSON object per stdout line, as emitted by
//! `codex exec --json` (`codex-rs/exec/src/exec_events.rs`). Nothing here is
//! a domain model or an IPC DTO, and nothing here leaves the adapter —
//! `translate.rs` and `errors.rs` map these shapes onto domain frames and
//! `RunFailure`s (DTO ≠ Domain ≠ Provider Payload).
//!
//! Deserialization is deliberately lenient: unknown event types collapse into
//! `Unknown`, and items are read as one flat struct whose fields are all
//! optional, so a new item type or field cannot break a running stream.

use serde::Deserialize;

/// One `codex exec --json` event line.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "type")]
pub enum ThreadEvent {
    #[serde(rename = "thread.started")]
    ThreadStarted {},
    #[serde(rename = "turn.started")]
    TurnStarted {},
    #[serde(rename = "turn.completed")]
    TurnCompleted {},
    #[serde(rename = "turn.failed")]
    TurnFailed {
        #[serde(default)]
        error: Option<WireError>,
    },
    #[serde(rename = "item.started")]
    ItemStarted { item: WireItem },
    #[serde(rename = "item.updated")]
    ItemUpdated { item: WireItem },
    #[serde(rename = "item.completed")]
    ItemCompleted { item: WireItem },
    /// A stream-level error notice. Codex can report recoverable problems
    /// (for example a reconnect) this way, so it is not terminal by itself.
    #[serde(rename = "error")]
    Error {
        #[serde(default)]
        message: Option<String>,
    },
    #[serde(other)]
    Unknown,
}

/// `{"message": ...}` payload of `turn.failed`.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct WireError {
    #[serde(default)]
    pub message: Option<String>,
}

/// One thread item (`agent_message`, `reasoning`, `command_execution`,
/// `file_change`, `mcp_tool_call`, `web_search`, `todo_list`, `error`...).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct WireItem {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub command: Option<String>,
    #[serde(default)]
    pub aggregated_output: Option<String>,
    #[serde(default)]
    pub exit_code: Option<i64>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub changes: Option<Vec<WireFileChange>>,
    #[serde(default)]
    pub server: Option<String>,
    #[serde(default)]
    pub tool: Option<String>,
    #[serde(default)]
    pub arguments: Option<serde_json::Value>,
    #[serde(default)]
    pub query: Option<String>,
}

/// One entry of a `file_change` item.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct WireFileChange {
    pub path: String,
    #[serde(default)]
    pub kind: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn decode(json: &str) -> ThreadEvent {
        serde_json::from_str(json).expect("test event decodes")
    }

    #[test]
    fn decodes_the_documented_lifecycle_events() {
        assert_eq!(
            decode(r#"{"type":"thread.started","thread_id":"0199a213"}"#),
            ThreadEvent::ThreadStarted {}
        );
        assert_eq!(
            decode(r#"{"type":"turn.started"}"#),
            ThreadEvent::TurnStarted {}
        );
        assert_eq!(
            decode(
                r#"{"type":"turn.completed","usage":{"input_tokens":1,"cached_input_tokens":0,"output_tokens":2}}"#
            ),
            ThreadEvent::TurnCompleted {}
        );
        assert_eq!(
            decode(r#"{"type":"turn.failed","error":{"message":"boom"}}"#),
            ThreadEvent::TurnFailed {
                error: Some(WireError {
                    message: Some("boom".to_owned())
                })
            }
        );
    }

    #[test]
    fn decodes_a_command_item() {
        let event = decode(
            r#"{"type":"item.completed","item":{"id":"item_1","type":"command_execution","command":"bash -lc ls","aggregated_output":"a\n","exit_code":0,"status":"completed"}}"#,
        );
        match event {
            ThreadEvent::ItemCompleted { item } => {
                assert_eq!(item.id, "item_1");
                assert_eq!(item.kind, "command_execution");
                assert_eq!(item.command.as_deref(), Some("bash -lc ls"));
                assert_eq!(item.exit_code, Some(0));
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn unknown_event_types_and_item_fields_are_tolerated() {
        assert_eq!(
            decode(r#"{"type":"thread.forked","extra":1}"#),
            ThreadEvent::Unknown
        );
        let event = decode(
            r#"{"type":"item.started","item":{"id":"i","type":"brand_new","whatever":[1,2]}}"#,
        );
        assert!(matches!(event, ThreadEvent::ItemStarted { item } if item.kind == "brand_new"));
    }
}
