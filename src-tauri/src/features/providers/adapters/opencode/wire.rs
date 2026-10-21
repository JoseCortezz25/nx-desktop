//! OpenCode vendor payloads (issue #27). They never leave the adapter.
//!
//! Two shapes are read, both from OpenCode v2.1.1 (see
//! `odd/tasks/issue-27-opencode-provider.md` for the evidence):
//!
//! - `opencode api --standalone model.list` prints the server's
//!   `model.list` response: `{"location": ..., "data": [model, ...]}`. Only
//!   the fields below are decoded; everything else in a model row —
//!   including `headers`, `body` and `settings`, which may carry provider
//!   configuration — is skipped by Serde and never stored.
//! - `opencode run --format json` prints one JSON object per line:
//!   `{"type", "timestamp", "sessionID", ...}` where `type` is
//!   `step_start`, `text`, `reasoning`, `tool_use`, `step_finish` or `error`.

use serde::Deserialize;
use serde_json::Value;

/// The `model.list` response envelope.
#[derive(Debug, Deserialize)]
pub struct ModelListEnvelope {
    pub data: Vec<WireModel>,
}

/// One model row of `model.list`.
#[derive(Debug, Deserialize)]
pub struct WireModel {
    pub id: String,
    #[serde(rename = "providerID")]
    pub provider_id: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub enabled: Option<bool>,
    #[serde(default)]
    pub variants: Option<Vec<WireVariant>>,
}

/// One `#variant` a model exposes; its id is the `--model` suffix.
#[derive(Debug, Deserialize)]
pub struct WireVariant {
    pub id: String,
}

/// One `run --format json` line. Every field is optional so an unknown or
/// partial event decodes and is skipped instead of failing the run.
#[derive(Debug, Default, Deserialize)]
pub struct RunLine {
    #[serde(rename = "type", default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub part: Option<RunPart>,
    #[serde(default)]
    pub error: Option<Value>,
}

/// The `part` of a `text` or `tool_use` line.
#[derive(Debug, Default, Deserialize)]
pub struct RunPart {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(rename = "partID", default)]
    pub part_id: Option<String>,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub tool: Option<String>,
    #[serde(default)]
    pub state: Option<ToolState>,
}

/// The `state` of a finished tool part (`completed` or `error`).
#[derive(Debug, Default, Deserialize)]
pub struct ToolState {
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub input: Option<Value>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_rows_skip_configuration_fields() {
        let raw = r#"{"location":{"directory":"/tmp"},"data":[{"id":"claude-opus-5-5",
            "providerID":"anthropic","name":"Claude Opus 5.5","enabled":true,
            "headers":{"x-api-key":"sk-never-decoded"},"settings":{"apiKey":"sk"},
            "variants":[{"id":"high","settings":{"effort":"high"}}]}]}"#;
        let envelope: ModelListEnvelope = serde_json::from_str(raw).expect("decodes");
        let model = &envelope.data[0];
        assert_eq!(model.provider_id, "anthropic");
        assert_eq!(model.variants.as_ref().map(Vec::len), Some(1));
        assert!(!format!("{envelope:?}").contains("sk-never-decoded"));
    }

    #[test]
    fn run_lines_tolerate_unknown_and_partial_events() {
        let line: RunLine =
            serde_json::from_str(r#"{"type":"something_new","extra":1}"#).expect("decodes");
        assert_eq!(line.kind.as_deref(), Some("something_new"));
        let empty: RunLine = serde_json::from_str("{}").expect("decodes");
        assert!(empty.kind.is_none());
    }
}
