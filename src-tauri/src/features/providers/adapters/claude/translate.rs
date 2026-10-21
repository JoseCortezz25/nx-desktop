//! Claude stream events → domain run progress (issue #25).
//!
//! A pure state machine, independent of HTTP, so the frame mapping is unit
//! tested without a socket. It produces exactly the progress the fake runner
//! produces — `text_delta` and `tool_activity` — and a single outcome; the
//! supervisor still owns `started` and the terminal frames.
//!
//! Stop reasons: `end_turn` and `stop_sequence` complete the run. Every other
//! reason fails it instead of silently succeeding — `max_tokens` (truncated
//! answer), `refusal` (the model declined), `tool_use` (no tools are sent, so
//! tool execution is unsupported) and `pause_turn` (the turn needs a
//! continuation this single-turn adapter does not issue).

use std::collections::HashMap;

use super::errors::vendor_failure;
use super::wire::{BlockDelta, ContentBlock, StopReason, StreamEvent};
use crate::features::conversations::domain::{ToolCall, ToolCallKind, ToolCallStatus};
use crate::features::runs::domain::RunFailure;

/// Largest tool input kept for the activity row detail.
pub const MAX_TOOL_INPUT_BYTES: usize = 4 * 1024;

/// Largest tool name kept for the activity row summary.
const MAX_TOOL_NAME_CHARS: usize = 64;

/// What one stream event asks the adapter to do.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Translation {
    /// Nothing to forward (ping, message_start, thinking, unknown...).
    Skip,
    /// Forward assistant text.
    Text(String),
    /// Forward a tool activity row.
    Tool(ToolCall),
    /// The stream reached its outcome; stop reading.
    Finished(Result<(), RunFailure>),
}

#[derive(Debug, Default)]
struct PendingTool {
    id: String,
    name: String,
    input: String,
}

/// Accumulates per-block state across events.
#[derive(Debug, Default)]
pub struct StreamTranslator {
    tools: HashMap<usize, PendingTool>,
    stop_reason: Option<StopReason>,
}

impl StreamTranslator {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn apply(&mut self, event: StreamEvent) -> Translation {
        match event {
            StreamEvent::ContentBlockStart {
                index,
                content_block,
            } => match content_block {
                ContentBlock::Text { text } => text_translation(text),
                ContentBlock::ToolUse { id, name } => {
                    self.tools.insert(
                        index,
                        PendingTool {
                            id,
                            name: name.chars().take(MAX_TOOL_NAME_CHARS).collect(),
                            input: String::new(),
                        },
                    );
                    Translation::Skip
                }
                ContentBlock::Unknown => Translation::Skip,
            },
            StreamEvent::ContentBlockDelta { index, delta } => match delta {
                BlockDelta::TextDelta { text } => text_translation(text),
                BlockDelta::InputJsonDelta { partial_json } => {
                    if let Some(tool) = self.tools.get_mut(&index) {
                        append_bounded(&mut tool.input, &partial_json);
                    }
                    Translation::Skip
                }
                BlockDelta::ThinkingDelta {} | BlockDelta::Unknown => Translation::Skip,
            },
            StreamEvent::ContentBlockStop { index } => match self.tools.remove(&index) {
                Some(tool) => Translation::Tool(ToolCall {
                    id: tool.id,
                    kind: ToolCallKind::Command,
                    summary: format!("Requested tool: {}", tool.name),
                    detail: tool.input,
                    status: ToolCallStatus::Pending,
                    subagent_id: None,
                }),
                None => Translation::Skip,
            },
            StreamEvent::MessageDelta { delta } => {
                if delta.stop_reason.is_some() {
                    self.stop_reason = delta.stop_reason;
                }
                Translation::Skip
            }
            StreamEvent::MessageStop {} => Translation::Finished(stop_outcome(self.stop_reason)),
            StreamEvent::Error { error } => {
                Translation::Finished(Err(vendor_failure(None, Some(error.kind.as_str()))))
            }
            StreamEvent::MessageStart {} | StreamEvent::Ping {} | StreamEvent::Unknown => {
                Translation::Skip
            }
        }
    }
}

fn text_translation(text: String) -> Translation {
    if text.is_empty() {
        Translation::Skip
    } else {
        Translation::Text(text)
    }
}

/// Appends without exceeding [`MAX_TOOL_INPUT_BYTES`], never splitting a
/// UTF-8 character.
fn append_bounded(target: &mut String, addition: &str) {
    let room = MAX_TOOL_INPUT_BYTES.saturating_sub(target.len());
    if addition.len() <= room {
        target.push_str(addition);
        return;
    }
    let mut cut = room;
    while cut > 0 && !addition.is_char_boundary(cut) {
        cut -= 1;
    }
    target.push_str(&addition[..cut]);
}

/// Terminal outcome for the reason the final `message_delta` reported.
pub fn stop_outcome(stop_reason: Option<StopReason>) -> Result<(), RunFailure> {
    match stop_reason {
        Some(StopReason::EndTurn | StopReason::StopSequence) => Ok(()),
        Some(StopReason::MaxTokens) => Err(RunFailure::internal(
            "Claude stopped at the max_tokens limit; the response is incomplete",
        )),
        Some(StopReason::Refusal) => Err(RunFailure::internal(
            "Claude declined to complete this request (refusal)",
        )),
        Some(StopReason::ToolUse) => Err(RunFailure::internal(
            "Claude requested tool execution, which this adapter does not support yet",
        )),
        Some(StopReason::PauseTurn) => Err(RunFailure::internal(
            "Claude paused the turn before finishing (pause_turn)",
        )),
        Some(StopReason::Unknown) | None => Err(RunFailure::internal(
            "Claude finished without a recognised stop reason",
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::runs::domain::RunFailureCode;

    fn event(json: &str) -> StreamEvent {
        serde_json::from_str(json).expect("test event parses")
    }

    #[test]
    fn maps_a_text_stream_to_deltas_and_completion() {
        let mut translator = StreamTranslator::new();
        let script = [
            r#"{"type":"message_start","message":{}}"#,
            r#"{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}"#,
            r#"{"type":"ping"}"#,
            r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}"#,
            r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}"#,
            r#"{"type":"content_block_stop","index":0}"#,
            r#"{"type":"message_delta","delta":{"stop_reason":"end_turn"}}"#,
            r#"{"type":"message_stop"}"#,
        ];
        let translations: Vec<Translation> = script
            .iter()
            .map(|json| translator.apply(event(json)))
            .filter(|translation| *translation != Translation::Skip)
            .collect();
        assert_eq!(
            translations,
            vec![
                Translation::Text("Hello".to_owned()),
                Translation::Text(" world".to_owned()),
                Translation::Finished(Ok(())),
            ]
        );
    }

    #[test]
    fn thinking_deltas_are_not_surfaced() {
        let mut translator = StreamTranslator::new();
        assert_eq!(
            translator.apply(event(
                r#"{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"hmm"}}"#
            )),
            Translation::Skip
        );
    }

    #[test]
    fn tool_use_blocks_become_tool_activity() {
        let mut translator = StreamTranslator::new();
        translator.apply(event(
            r#"{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_1","name":"grep","input":{}}}"#,
        ));
        translator.apply(event(
            r#"{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"q\":"}}"#,
        ));
        translator.apply(event(
            r#"{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\"x\"}"}}"#,
        ));
        let translation = translator.apply(event(r#"{"type":"content_block_stop","index":1}"#));
        assert_eq!(
            translation,
            Translation::Tool(ToolCall {
                id: "toolu_1".to_owned(),
                kind: ToolCallKind::Command,
                summary: "Requested tool: grep".to_owned(),
                detail: "{\"q\":\"x\"}".to_owned(),
                status: ToolCallStatus::Pending,
                subagent_id: None,
            })
        );
    }

    #[test]
    fn tool_input_is_bounded_on_a_char_boundary() {
        let mut input = "a".repeat(MAX_TOOL_INPUT_BYTES - 1);
        append_bounded(&mut input, "é tail");
        assert_eq!(input.len(), MAX_TOOL_INPUT_BYTES - 1);
        append_bounded(&mut input, "b");
        assert_eq!(input.len(), MAX_TOOL_INPUT_BYTES);
    }

    #[test]
    fn non_success_stop_reasons_fail_the_run() {
        for reason in [
            StopReason::MaxTokens,
            StopReason::Refusal,
            StopReason::ToolUse,
            StopReason::PauseTurn,
            StopReason::Unknown,
        ] {
            let failure = stop_outcome(Some(reason)).expect_err("must not succeed");
            assert_eq!(failure.code, RunFailureCode::Internal, "{reason:?}");
        }
        assert!(stop_outcome(None).is_err());
        assert_eq!(stop_outcome(Some(StopReason::EndTurn)), Ok(()));
        assert_eq!(stop_outcome(Some(StopReason::StopSequence)), Ok(()));
    }

    #[test]
    fn refusal_mid_stream_fails_at_message_stop() {
        let mut translator = StreamTranslator::new();
        translator.apply(event(
            r#"{"type":"message_delta","delta":{"stop_reason":"refusal"}}"#,
        ));
        match translator.apply(event(r#"{"type":"message_stop"}"#)) {
            Translation::Finished(Err(failure)) => assert!(failure.message.contains("refusal")),
            other => panic!("expected a refusal failure, got {other:?}"),
        }
    }

    #[test]
    fn error_events_finish_with_a_mapped_failure() {
        let mut translator = StreamTranslator::new();
        let translation = translator.apply(event(
            r#"{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}"#,
        ));
        match translation {
            Translation::Finished(Err(failure)) => {
                assert_eq!(failure.code, RunFailureCode::ProviderUnavailable);
                assert!(!failure.message.contains("Overloaded"));
            }
            other => panic!("expected a failure, got {other:?}"),
        }
    }
}
