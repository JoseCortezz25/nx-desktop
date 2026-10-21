//! Provider-routing run adapter (issue #25).
//!
//! The supervisor holds exactly one [`AgentRunner`]; this adapter lets each
//! engine own its own runner by dispatching on the validated
//! `provider_id`. Providers without a dedicated runner fall back to a default
//! (the fake runner in dev/tests), so registering the Claude adapter never
//! removes the fake providers.

use std::collections::HashMap;
use std::sync::Arc;

use super::super::domain::RunFailure;
use super::super::ports::{
    AgentRunner, BoxFuture, Cancellation, RunExecutionRequest, RunProgressSink,
};

/// Dispatches each run to the runner registered for its provider.
pub struct ProviderRoutingRunner {
    routes: HashMap<String, Arc<dyn AgentRunner>>,
    fallback: Arc<dyn AgentRunner>,
}

impl ProviderRoutingRunner {
    pub fn new(fallback: Arc<dyn AgentRunner>) -> Self {
        Self {
            routes: HashMap::new(),
            fallback,
        }
    }

    /// Routes `provider_id` to `runner`, replacing any earlier route.
    pub fn with_route(
        mut self,
        provider_id: impl Into<String>,
        runner: Arc<dyn AgentRunner>,
    ) -> Self {
        self.routes.insert(provider_id.into(), runner);
        self
    }

    fn runner_for(&self, provider_id: &str) -> &Arc<dyn AgentRunner> {
        self.routes.get(provider_id).unwrap_or(&self.fallback)
    }
}

impl AgentRunner for ProviderRoutingRunner {
    fn execute<'a>(
        &'a self,
        request: RunExecutionRequest,
        cancellation: Cancellation,
        sink: Arc<dyn RunProgressSink>,
    ) -> BoxFuture<'a, Result<(), RunFailure>> {
        self.runner_for(&request.provider_id)
            .execute(request, cancellation, sink)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::conversations::domain::{ConversationId, ToolCall};
    use crate::features::projects::domain::ProjectId;
    use crate::features::providers::domain::{EffortLevel, ModelId, ProviderId};
    use crate::features::runs::domain::{RunEnvironment, RunPrompt, StartRunSpec};

    struct Labelled(&'static str);

    impl AgentRunner for Labelled {
        fn execute<'a>(
            &'a self,
            _request: RunExecutionRequest,
            _cancellation: Cancellation,
            sink: Arc<dyn RunProgressSink>,
        ) -> BoxFuture<'a, Result<(), RunFailure>> {
            sink.text_delta(self.0.to_owned());
            Box::pin(async { Ok(()) })
        }
    }

    #[derive(Default)]
    struct Recorder(std::sync::Mutex<Vec<String>>);

    impl RunProgressSink for Recorder {
        fn text_delta(&self, text: String) {
            self.0
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .push(text);
        }

        fn tool_activity(&self, _tool_call: ToolCall) {}
    }

    fn request(provider: &str) -> RunExecutionRequest {
        RunExecutionRequest::from_spec(&StartRunSpec {
            conversation_id: ConversationId::new("conv-1").expect("id"),
            project_id: ProjectId::new("proj-1").expect("id"),
            provider_id: ProviderId::new(provider).expect("id"),
            model_id: ModelId::new("model").expect("id"),
            effort_level: EffortLevel::new("high").expect("stop"),
            prompt: RunPrompt::new("prompt").expect("prompt"),
            environment: RunEnvironment::new(false, "main", "local").expect("environment"),
        })
    }

    #[tokio::test]
    async fn routes_by_provider_and_falls_back_for_the_rest() {
        let router = ProviderRoutingRunner::new(Arc::new(Labelled("fallback")))
            .with_route("claude", Arc::new(Labelled("claude")));
        let recorder = Arc::new(Recorder::default());
        for provider in ["claude", "opencode", "codex"] {
            router
                .execute(request(provider), Cancellation::new(), recorder.clone())
                .await
                .expect("labelled runners succeed");
        }
        let seen = recorder
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone();
        assert_eq!(seen, vec!["claude", "fallback", "fallback"]);
    }
}
