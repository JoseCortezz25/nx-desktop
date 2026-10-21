//! OpenCode run lines → domain run progress (issue #27).
//!
//! A pure state machine, independent of the child process, so the frame
//! mapping is unit tested without spawning anything. It produces exactly the
//! progress the fake runner produces — `text_delta` and `tool_activity` — and
//! at most one failure; the supervisor still owns `started` and the terminal
//! frames.
//!
//! - `text` → `text_delta`. OpenCode emits one line per finished text block,
//!   so blocks after the first are separated by a blank line.
//! - `tool_use` (emitted when a tool finishes) → `tool_activity` with status
//!   `completed` or `failed`; the row carries the tool name and a bounded
//!   copy of its input, never its output.
//! - `error` → the run failure (see `errors.rs`).
//! - `step_start`, `step_finish`, `reasoning` and unknown types are skipped.
//!
//! A line that does not start with `{` is not an event (OpenCode prints its
//! warnings to stderr, but a stray line must not fail a run); a line that
//! does start with `{` and is not valid JSON is a malformed event.

use super::errors::{event_failure, malformed_stream};
use super::wire::{RunLine, RunPart};
use crate::features::conversations::domain::{ToolCall, ToolCallKind, ToolCallStatus};
use crate::features::runs::domain::RunFailure;

/// Largest tool input kept for the activity row detail.
pub const MAX_TOOL_INPUT_BYTES: usize = 4 * 1024;

/// Largest tool name kept for the activity row summary.
const MAX_TOOL_NAME_CHARS: usize = 64;

/// What one stream line asks the adapter to do.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Translation {
    Skip,
    Text(String),
    Tool(ToolCall),
    /// The run failed; stop reading and terminate the process.
    Failed(RunFailure),
}

/// Accumulates cross-line state (block separation, synthetic tool ids).
#[derive(Debug, Default)]
pub struct LineTranslator {
    emitted_text: bool,
    tool_count: usize,
}

impl LineTranslator {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn apply(&mut self, line: &str) -> Translation {
        let trimmed = line.trim();
        if !trimmed.starts_with('{') {
            return Translation::Skip;
        }
        let Ok(decoded) = serde_json::from_str::<RunLine>(trimmed) else {
            return Translation::Failed(malformed_stream());
        };
        match decoded.kind.as_deref() {
            Some("text") => self.text(decoded.part),
            Some("tool_use") => decoded
                .part
                .map_or(Translation::Skip, |part| Translation::Tool(self.tool(part))),
            Some("error") => Translation::Failed(event_failure(decoded.error.as_ref())),
            _ => Translation::Skip,
        }
    }

    fn text(&mut self, part: Option<RunPart>) -> Translation {
        let Some(text) = part.and_then(|part| part.text) else {
            return Translation::Skip;
        };
        if text.trim().is_empty() {
            return Translation::Skip;
        }
        let text = if self.emitted_text {
            format!("\n\n{text}")
        } else {
            text
        };
        self.emitted_text = true;
        Translation::Text(text)
    }

    fn tool(&mut self, part: RunPart) -> ToolCall {
        self.tool_count += 1;
        let name: String = part
            .tool
            .as_deref()
            .unwrap_or("tool")
            .chars()
            .take(MAX_TOOL_NAME_CHARS)
            .collect();
        let state = part.state.unwrap_or_default();
        let status = match state.status.as_deref() {
            Some("error") => ToolCallStatus::Failed,
            Some("completed") => ToolCallStatus::Completed,
            Some("running") => ToolCallStatus::Running,
            _ => ToolCallStatus::Pending,
        };
        let detail = state
            .input
            .map(|input| bounded(input.to_string()))
            .unwrap_or_default();
        let id = part
            .part_id
            .or(part.id)
            .filter(|id| !id.is_empty() && id.len() <= MAX_TOOL_INPUT_BYTES)
            .unwrap_or_else(|| format!("opencode-tool-{}", self.tool_count));
        ToolCall {
            id,
            kind: tool_kind(&name),
            summary: format!("Tool: {name}"),
            detail,
            status,
            subagent_id: None,
        }
    }
}

/// Classifies OpenCode's built-in tool names; anything else is a command.
fn tool_kind(name: &str) -> ToolCallKind {
    match name {
        "grep" | "glob" | "codesearch" | "websearch" | "webfetch" => ToolCallKind::Search,
        "list" | "ls" | "read" => ToolCallKind::ListFiles,
        "edit" | "write" | "patch" | "apply_patch" | "multiedit" => ToolCallKind::Diff,
        _ => ToolCallKind::Command,
    }
}

/// Truncates on a character boundary at [`MAX_TOOL_INPUT_BYTES`].
fn bounded(mut text: String) -> String {
    if text.len() > MAX_TOOL_INPUT_BYTES {
        let mut cut = MAX_TOOL_INPUT_BYTES;
        while !text.is_char_boundary(cut) {
            cut -= 1;
        }
        text.truncate(cut);
    }
    text
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::runs::domain::RunFailureCode;

    #[test]
    fn text_blocks_become_deltas_separated_by_a_blank_line() {
        let mut translator = LineTranslator::new();
        let first = r#"{"type":"text","timestamp":1,"sessionID":"ses_1","part":{"type":"text","text":"Hello"}}"#;
        let second = r#"{"type":"text","part":{"text":"World"}}"#;
        assert_eq!(
            translator.apply(first),
            Translation::Text("Hello".to_owned())
        );
        assert_eq!(
            translator.apply(second),
            Translation::Text("\n\nWorld".to_owned())
        );
        assert_eq!(
            translator.apply(r#"{"type":"text","part":{"text":"  "}}"#),
            Translation::Skip
        );
    }

    #[test]
    fn finished_tools_become_activity_rows_without_their_output() {
        let mut translator = LineTranslator::new();
        let line = r#"{"type":"tool_use","part":{"partID":"prt_1","type":"tool","tool":"bash",
            "state":{"status":"completed","input":{"command":"ls"},"output":"secret.txt"}}}"#;
        let Translation::Tool(tool) = translator.apply(&line.replace('\n', " ")) else {
            panic!("expected a tool row");
        };
        assert_eq!(tool.id, "prt_1");
        assert_eq!(tool.kind, ToolCallKind::Command);
        assert_eq!(tool.status, ToolCallStatus::Completed);
        assert_eq!(tool.summary, "Tool: bash");
        assert_eq!(tool.detail, r#"{"command":"ls"}"#);
        assert!(!tool.detail.contains("secret.txt"));

        let failed =
            r#"{"type":"tool_use","part":{"tool":"edit","state":{"status":"error","input":{}}}}"#;
        let Translation::Tool(tool) = translator.apply(failed) else {
            panic!("expected a tool row");
        };
        assert_eq!(tool.status, ToolCallStatus::Failed);
        assert_eq!(tool.kind, ToolCallKind::Diff);
        assert_eq!(tool.id, "opencode-tool-2");
    }

    #[test]
    fn tool_input_is_bounded() {
        let mut translator = LineTranslator::new();
        let big = "é".repeat(MAX_TOOL_INPUT_BYTES);
        let line = format!(
            r#"{{"type":"tool_use","part":{{"tool":"write","state":{{"status":"completed","input":{{"content":"{big}"}}}}}}}}"#
        );
        let Translation::Tool(tool) = translator.apply(&line) else {
            panic!("expected a tool row");
        };
        assert!(tool.detail.len() <= MAX_TOOL_INPUT_BYTES);
    }

    #[test]
    fn lifecycle_reasoning_and_unknown_lines_are_skipped() {
        let mut translator = LineTranslator::new();
        for line in [
            r#"{"type":"step_start","part":{"type":"step-start"}}"#,
            r#"{"type":"step_finish","part":{"reason":"stop"}}"#,
            r#"{"type":"reasoning","part":{"text":"thinking"}}"#,
            r#"{"type":"brand_new"}"#,
            "",
            "Warning: not an event",
        ] {
            assert_eq!(translator.apply(line), Translation::Skip, "{line}");
        }
    }

    #[test]
    fn error_lines_and_malformed_json_fail_the_run() {
        let mut translator = LineTranslator::new();
        let Translation::Failed(failure) = translator
            .apply(r#"{"type":"error","error":{"name":"APIError","data":{"statusCode":429}}}"#)
        else {
            panic!("expected a failure");
        };
        assert_eq!(failure.code, RunFailureCode::ProviderUnavailable);

        let Translation::Failed(failure) = translator.apply(r#"{"type":"text","part":"#) else {
            panic!("expected a failure");
        };
        assert_eq!(failure.code, RunFailureCode::Internal);
    }
}
