//! In-memory run adapter (issue #19).
//!
//! Streams a deterministic response from the composer prompt: bounded word
//! chunks followed by one tool activity, with a cancellation check between
//! every frame. This is scaffolding, not an engine integration — the real
//! `opencode` / `codex` / `claude` process adapters belong to #25–#27 and
//! replace this implementation behind the same [`AgentRunner`] port.
//!
//! The fake is deterministic so the supervisor tests can assert frame order
//! without timing tricks; the default chunk delay only makes the stream feel
//! live in the app.

use std::sync::Arc;
use std::time::Duration;

use super::super::domain::RunFailure;
use super::super::ports::{
    AgentRunner, BoxFuture, Cancellation, RunExecutionRequest, RunProgressSink,
};
use crate::features::conversations::domain::{ToolCall, ToolCallKind, ToolCallStatus};

/// Delay between fake frames; `Duration::ZERO` keeps tests instant.
#[derive(Debug, Clone)]
pub struct FakeAgentRunner {
    chunk_delay: Duration,
}

impl FakeAgentRunner {
    pub fn new(chunk_delay: Duration) -> Self {
        Self { chunk_delay }
    }
}

impl Default for FakeAgentRunner {
    fn default() -> Self {
        Self::new(Duration::from_millis(20))
    }
}

impl AgentRunner for FakeAgentRunner {
    fn execute<'a>(
        &'a self,
        request: RunExecutionRequest,
        cancellation: Cancellation,
        sink: Arc<dyn RunProgressSink>,
    ) -> BoxFuture<'a, Result<(), RunFailure>> {
        Box::pin(async move {
            let response = fake_response(&request.prompt);
            for chunk in word_chunks(&response) {
                if wait_or_cancel(&cancellation, self.chunk_delay).await {
                    return Err(RunFailure::cancelled());
                }
                sink.text_delta(chunk);
            }
            if wait_or_cancel(&cancellation, self.chunk_delay).await {
                return Err(RunFailure::cancelled());
            }
            sink.tool_activity(ToolCall {
                id: "tool-fake-1".to_owned(),
                kind: ToolCallKind::Search,
                summary: "Searched the workspace".to_owned(),
                detail: "Fake provider tool activity for the started run.".to_owned(),
                status: ToolCallStatus::Completed,
                subagent_id: None,
            });
            if wait_or_cancel(&cancellation, self.chunk_delay).await {
                return Err(RunFailure::cancelled());
            }
            Ok(())
        })
    }
}

/// Deterministic fake answer. The prompt is previewed, not echoed in full, so
/// a very long composer submission cannot turn the fake into a slow stream.
fn fake_response(prompt: &str) -> String {
    let preview: String = prompt.chars().take(120).collect();
    format!("Simulated response to: {preview}")
}

/// Splits text into bounded word chunks, preserving the original spacing
/// between words inside each chunk.
fn word_chunks(text: &str) -> Vec<String> {
    let mut chunks = Vec::new();
    let mut current = String::new();
    for word in text.split_whitespace() {
        if !current.is_empty() {
            current.push(' ');
        }
        current.push_str(word);
        if current.len() >= 24 {
            chunks.push(std::mem::take(&mut current));
        }
    }
    if !current.is_empty() {
        chunks.push(current);
    }
    chunks
}

/// Sleeps for `delay` unless cancellation arrives first.
async fn wait_or_cancel(cancellation: &Cancellation, delay: Duration) -> bool {
    tokio::select! {
        () = cancellation.cancelled() => true,
        () = tokio::time::sleep(delay) => false,
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use super::*;
    use crate::features::conversations::domain::ConversationId;
    use crate::features::conversations::domain::ToolCall;
    use crate::features::projects::domain::ProjectId;
    use crate::features::providers::domain::{EffortLevel, ModelId, ProviderId};
    use crate::features::runs::domain::{RunEnvironment, StartRunSpec};

    #[derive(Default)]
    struct RecordingSink {
        text: Mutex<Vec<String>>,
        tools: Mutex<Vec<ToolCall>>,
    }

    impl RunProgressSink for RecordingSink {
        fn text_delta(&self, text: String) {
            self.text
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .push(text);
        }

        fn tool_activity(&self, tool_call: ToolCall) {
            self.tools
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .push(tool_call);
        }
    }

    fn request() -> RunExecutionRequest {
        RunExecutionRequest::from_spec(&StartRunSpec {
            conversation_id: ConversationId::new("conv-composer-chain").expect("fixture id"),
            project_id: ProjectId::new("proj-design-system").expect("fixture id"),
            provider_id: ProviderId::new("opencode").expect("fixture id"),
            model_id: ModelId::new("deepseek-v3.1").expect("fixture id"),
            effort_level: EffortLevel::new("high").expect("fixture stop"),
            prompt: crate::features::runs::domain::RunPrompt::new(
                "Reconcile the provider, model, and effort selectors.",
            )
            .expect("fixture prompt"),
            environment: RunEnvironment::new(false, "main", "local").expect("fixture environment"),
        })
    }

    #[tokio::test]
    async fn streams_text_and_tool_activity_then_completes() {
        let sink = Arc::new(RecordingSink::default());
        let result = FakeAgentRunner::new(Duration::ZERO)
            .execute(request(), Cancellation::new(), sink.clone())
            .await;
        assert_eq!(result, Ok(()));
        let text = sink
            .text
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .join(" ");
        assert!(text.contains("Reconcile the provider"));
        assert_eq!(
            sink.tools
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .len(),
            1
        );
    }

    /// Cancels on the first text frame, so the adapter observes the signal
    /// between chunks and must stop instead of finishing the stream.
    struct CancellingSink {
        cancellation: Cancellation,
        text: Mutex<Vec<String>>,
    }

    impl RunProgressSink for CancellingSink {
        fn text_delta(&self, text: String) {
            self.text
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .push(text);
            self.cancellation.cancel();
        }

        fn tool_activity(&self, _tool_call: ToolCall) {}
    }

    #[tokio::test]
    async fn stops_on_cancellation() {
        let cancellation = Cancellation::new();
        let sink = Arc::new(CancellingSink {
            cancellation: cancellation.clone(),
            text: Mutex::new(Vec::new()),
        });
        let result = FakeAgentRunner::new(Duration::from_millis(20))
            .execute(request(), cancellation, sink.clone())
            .await;
        assert_eq!(result, Err(RunFailure::cancelled()));
        assert_eq!(
            sink.text
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .len(),
            1
        );
    }
}
