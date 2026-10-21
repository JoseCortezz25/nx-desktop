//! Claude Messages API wire formats (issue #25).
//!
//! Vendor payloads only: the request body sent to `POST /v1/messages`, the
//! server-sent stream events and the error envelope. Nothing here is a domain
//! model or an IPC DTO, and nothing here leaves the adapter — `translate.rs`
//! and `errors.rs` map these shapes onto domain frames and `RunFailure`s
//! (DTO ≠ Domain ≠ Provider Payload).
//!
//! Deserialization is deliberately lenient: unknown event, block, delta and
//! stop-reason variants collapse into `Unknown` instead of failing, so a new
//! vendor event type cannot break a running stream.

use serde::{Deserialize, Serialize};

/// `anthropic-version` header value the adapter speaks.
pub const ANTHROPIC_VERSION: &str = "2023-06-01";

/// `output_config.effort` values the Messages API accepts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum WireEffort {
    Low,
    Medium,
    High,
    Xhigh,
    Max,
}

/// Body of `POST /v1/messages` for one streamed, single-turn run.
///
/// No `thinking`, `temperature`, `top_p` or assistant prefill is sent: the
/// current models reject manual thinking budgets and prefill, and sampling
/// parameters stay at the vendor defaults.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MessagesRequest<'a> {
    pub model: &'a str,
    pub max_tokens: u32,
    pub messages: Vec<WireMessage<'a>>,
    pub stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system: Option<&'a str>,
    pub output_config: OutputConfig,
}

/// One conversation turn on the wire.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WireMessage<'a> {
    pub role: &'static str,
    pub content: &'a str,
}

/// `output_config` block carrying the effort control.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct OutputConfig {
    pub effort: WireEffort,
}

impl<'a> MessagesRequest<'a> {
    /// A streamed single user turn with the given effort.
    pub fn user_turn(model: &'a str, max_tokens: u32, prompt: &'a str, effort: WireEffort) -> Self {
        Self {
            model,
            max_tokens,
            messages: vec![WireMessage {
                role: "user",
                content: prompt,
            }],
            stream: true,
            system: None,
            output_config: OutputConfig { effort },
        }
    }
}

/// One server-sent event payload (`data:` JSON), tagged by `type`.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum StreamEvent {
    MessageStart {},
    ContentBlockStart {
        index: usize,
        content_block: ContentBlock,
    },
    ContentBlockDelta {
        index: usize,
        delta: BlockDelta,
    },
    ContentBlockStop {
        index: usize,
    },
    MessageDelta {
        delta: MessageDeltaBody,
    },
    MessageStop {},
    Ping {},
    Error {
        error: VendorError,
    },
    #[serde(other)]
    Unknown,
}

/// The block a `content_block_start` opens.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentBlock {
    Text {
        #[serde(default)]
        text: String,
    },
    ToolUse {
        id: String,
        name: String,
    },
    #[serde(other)]
    Unknown,
}

/// The incremental payload of a `content_block_delta`.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum BlockDelta {
    TextDelta {
        text: String,
    },
    InputJsonDelta {
        partial_json: String,
    },
    /// Thinking deltas are not surfaced: the frozen six-kind stream has no
    /// reasoning frame.
    ThinkingDelta {},
    #[serde(other)]
    Unknown,
}

/// The top-level `delta` of a `message_delta` event.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct MessageDeltaBody {
    #[serde(default)]
    pub stop_reason: Option<StopReason>,
}

/// Why the model stopped generating.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StopReason {
    EndTurn,
    MaxTokens,
    StopSequence,
    ToolUse,
    PauseTurn,
    Refusal,
    #[serde(other)]
    Unknown,
}

/// The vendor error object, shared by the HTTP error body and the stream
/// `error` event. `message` is parsed but never forwarded to the webview.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct VendorError {
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub message: String,
}

/// Body of a non-2xx HTTP response: `{"type":"error","error":{...}}`.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct ErrorEnvelope {
    pub error: VendorError,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_body_matches_the_messages_api_shape() {
        let body = MessagesRequest::user_turn("claude-opus-5-5", 64_000, "hi", WireEffort::Xhigh);
        let json = serde_json::to_value(&body).expect("request serializes");
        assert_eq!(
            json,
            serde_json::json!({
                "model": "claude-opus-5-5",
                "max_tokens": 64000,
                "messages": [{ "role": "user", "content": "hi" }],
                "stream": true,
                "output_config": { "effort": "xhigh" }
            })
        );
        let object = json.as_object().expect("object body");
        assert!(!object.contains_key("thinking"));
        assert!(!object.contains_key("temperature"));
        assert!(!object.contains_key("top_p"));
    }

    #[test]
    fn decodes_the_documented_stream_events() {
        let start: StreamEvent = serde_json::from_str(
            r#"{"type":"message_start","message":{"id":"msg_1","usage":{"input_tokens":3}}}"#,
        )
        .expect("message_start");
        assert_eq!(start, StreamEvent::MessageStart {});

        let delta: StreamEvent = serde_json::from_str(
            r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}"#,
        )
        .expect("text delta");
        assert_eq!(
            delta,
            StreamEvent::ContentBlockDelta {
                index: 0,
                delta: BlockDelta::TextDelta {
                    text: "Hi".to_owned()
                },
            }
        );

        let stop: StreamEvent = serde_json::from_str(
            r#"{"type":"message_delta","delta":{"stop_reason":"refusal","stop_sequence":null},"usage":{"output_tokens":5}}"#,
        )
        .expect("message_delta");
        assert_eq!(
            stop,
            StreamEvent::MessageDelta {
                delta: MessageDeltaBody {
                    stop_reason: Some(StopReason::Refusal)
                },
            }
        );

        let error: StreamEvent = serde_json::from_str(
            r#"{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}"#,
        )
        .expect("error event");
        assert_eq!(
            error,
            StreamEvent::Error {
                error: VendorError {
                    kind: "overloaded_error".to_owned(),
                    message: "Overloaded".to_owned(),
                },
            }
        );
    }

    #[test]
    fn unknown_variants_collapse_instead_of_failing() {
        let unknown: StreamEvent =
            serde_json::from_str(r#"{"type":"brand_new_event","payload":{"x":1}}"#)
                .expect("unknown event");
        assert_eq!(unknown, StreamEvent::Unknown);

        let block: StreamEvent = serde_json::from_str(
            r#"{"type":"content_block_start","index":1,"content_block":{"type":"thinking","thinking":""}}"#,
        )
        .expect("thinking block");
        assert_eq!(
            block,
            StreamEvent::ContentBlockStart {
                index: 1,
                content_block: ContentBlock::Unknown,
            }
        );

        let reason: StopReason = serde_json::from_str(r#""model_context_window_exceeded""#)
            .expect("unknown stop reason");
        assert_eq!(reason, StopReason::Unknown);
    }
}
