//! Run use cases (issue #19).
//!
//! Validates the Invariants and Authority tiers a start request needs before
//! the supervisor registers the run:
//!
//! - **Invariants**: the `provider → model → effort` chain resolves in the
//!   provider registry (`business-logic.md` §3.1).
//! - **Authority**: the project is known and the conversation belongs to that
//!   project (`docs/ipc/README.md` §6).
//!
//! No conversation row is mutated here: a failed or cancelled run leaves the
//! conversation and its history exactly as they were (`business-logic.md`
//! §3.2, "Run vs Conversation Separation").

use std::sync::Arc;

use super::domain::{RunError, StartRunSpec};
use super::ports::RunEventSink;
use super::supervisor::{RunSupervisor, StartedRun};
use crate::features::conversations::service::ConversationStore;
use crate::features::projects::service::ProjectStore;
use crate::features::providers::service::ProviderRegistry;

/// Validates one start request and registers it with the supervisor.
///
/// Returns the `pending` snapshot plus the driver future the command spawns.
pub fn start_run(
    supervisor: &RunSupervisor,
    conversations: &ConversationStore,
    projects: &ProjectStore,
    registry: &ProviderRegistry,
    spec: StartRunSpec,
    sink: Arc<dyn RunEventSink>,
) -> Result<StartedRun, RunError> {
    if !projects.contains(&spec.project_id) {
        return Err(RunError::UnknownProject {
            project_id: spec.project_id.as_str().to_owned(),
        });
    }
    let conversation =
        conversations
            .find(&spec.conversation_id)
            .ok_or_else(|| RunError::UnknownConversation {
                conversation_id: spec.conversation_id.as_str().to_owned(),
            })?;
    if conversation.project_id != spec.project_id.as_str() {
        return Err(RunError::ConversationProjectMismatch {
            conversation_id: spec.conversation_id.as_str().to_owned(),
            project_id: spec.project_id.as_str().to_owned(),
        });
    }
    registry
        .validate_selection(&spec.provider_id, &spec.model_id, &spec.effort_level)
        .map_err(RunError::SelectionChain)?;

    Ok(supervisor.start(spec, sink))
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use crate::features::conversations::domain::ConversationId;
    use crate::features::conversations::service::{ConversationStore, FixedClock};
    use crate::features::projects::domain::ProjectId;
    use crate::features::projects::service::ProjectStore;
    use crate::features::providers::adapters::fake::FakeAgentProvider;
    use crate::features::providers::domain::{
        EffortLevel, ModelId, ProviderId, SelectionChainError,
    };
    use crate::features::providers::service::ProviderRegistry;
    use crate::features::runs::domain::{RunEnvironment, RunFrame, RunPrompt, RunStatus};
    use crate::features::runs::ports::{
        AgentRunner, BoxFuture, Cancellation, RunExecutionRequest, RunProgressSink,
    };
    use crate::features::runs::supervisor::RunSupervisor;

    struct NoopRunner;

    impl AgentRunner for NoopRunner {
        fn execute<'a>(
            &'a self,
            _request: RunExecutionRequest,
            _cancellation: Cancellation,
            _sink: Arc<dyn RunProgressSink>,
        ) -> BoxFuture<'a, Result<(), crate::features::runs::domain::RunFailure>> {
            Box::pin(async { Ok(()) })
        }
    }

    struct DiscardSink;

    impl RunEventSink for DiscardSink {
        fn emit(&self, _frame: RunFrame) {}
    }

    struct Fixture {
        supervisor: RunSupervisor,
        conversations: ConversationStore,
        projects: ProjectStore,
        registry: ProviderRegistry,
    }

    impl Fixture {
        fn new() -> Self {
            Self {
                supervisor: RunSupervisor::new(Arc::new(NoopRunner)),
                conversations: ConversationStore::with_clock(Box::new(FixedClock::new(
                    "2026-10-20T12:00:00.000Z",
                ))),
                projects: ProjectStore::seeded(),
                registry: ProviderRegistry::new(&FakeAgentProvider),
            }
        }

        fn start(&self, spec: StartRunSpec) -> Result<StartedRun, RunError> {
            start_run(
                &self.supervisor,
                &self.conversations,
                &self.projects,
                &self.registry,
                spec,
                Arc::new(DiscardSink),
            )
        }
    }

    fn spec() -> StartRunSpec {
        StartRunSpec {
            conversation_id: ConversationId::new("conv-composer-chain").expect("fixture id"),
            project_id: ProjectId::new("proj-design-system").expect("fixture id"),
            provider_id: ProviderId::new("opencode").expect("fixture id"),
            model_id: ModelId::new("deepseek-v3.1").expect("fixture id"),
            effort_level: EffortLevel::new("high").expect("fixture stop"),
            prompt: RunPrompt::new("Reconcile the provider, model, and effort selectors.")
                .expect("fixture prompt"),
            environment: RunEnvironment::new(false, "main", "local").expect("fixture environment"),
        }
    }

    #[test]
    fn starts_a_known_run_as_pending() {
        let fixture = Fixture::new();
        let started = fixture.start(spec()).expect("start succeeds");
        assert_eq!(started.snapshot.status, RunStatus::Pending);
        assert_eq!(started.snapshot.conversation_id, "conv-composer-chain");
        assert_eq!(started.snapshot.project_id, "proj-design-system");
    }

    #[test]
    fn rejects_an_unknown_project() {
        let fixture = Fixture::new();
        let mut spec = spec();
        spec.project_id = ProjectId::new("proj-ghost").expect("id");
        assert_eq!(
            fixture.start(spec).expect_err("unknown project"),
            RunError::UnknownProject {
                project_id: "proj-ghost".to_owned(),
            }
        );
    }

    #[test]
    fn rejects_an_unknown_conversation() {
        let fixture = Fixture::new();
        let mut spec = spec();
        spec.conversation_id = ConversationId::new("conv-ghost").expect("id");
        assert_eq!(
            fixture.start(spec).expect_err("unknown conversation"),
            RunError::UnknownConversation {
                conversation_id: "conv-ghost".to_owned(),
            }
        );
    }

    #[test]
    fn rejects_a_conversation_from_another_project() {
        let fixture = Fixture::new();
        let mut spec = spec();
        spec.project_id = ProjectId::new("proj-api-client").expect("id");
        assert_eq!(
            fixture.start(spec).expect_err("mismatched parent"),
            RunError::ConversationProjectMismatch {
                conversation_id: "conv-composer-chain".to_owned(),
                project_id: "proj-api-client".to_owned(),
            }
        );
    }

    #[test]
    fn rejects_a_cross_provider_selection_chain() {
        let fixture = Fixture::new();
        let mut spec = spec();
        spec.model_id = ModelId::new("gpt-5-codex").expect("id");
        assert_eq!(
            fixture.start(spec).expect_err("cross-provider model"),
            RunError::SelectionChain(SelectionChainError::UnknownModel {
                provider_id: "opencode".to_owned(),
                model_id: "gpt-5-codex".to_owned(),
            })
        );
    }

    #[tokio::test]
    async fn a_failed_run_leaves_the_conversation_intact() {
        struct FailingRunner;

        impl AgentRunner for FailingRunner {
            fn execute<'a>(
                &'a self,
                _request: RunExecutionRequest,
                _cancellation: Cancellation,
                _sink: Arc<dyn RunProgressSink>,
            ) -> BoxFuture<'a, Result<(), crate::features::runs::domain::RunFailure>> {
                Box::pin(async {
                    Err(
                        crate::features::runs::domain::RunFailure::provider_unavailable(
                            "adapter failed",
                        ),
                    )
                })
            }
        }

        let conversations =
            ConversationStore::with_clock(Box::new(FixedClock::new("2026-10-20T12:00:00.000Z")));
        let before = conversations.list_conversations();
        let supervisor = RunSupervisor::new(Arc::new(FailingRunner));
        let projects = ProjectStore::seeded();
        let registry = ProviderRegistry::new(&FakeAgentProvider);
        let started = start_run(
            &supervisor,
            &conversations,
            &projects,
            &registry,
            spec(),
            Arc::new(DiscardSink),
        )
        .expect("start succeeds");
        tokio::time::timeout(std::time::Duration::from_secs(2), started.driver)
            .await
            .expect("driver finishes");

        let after = conversations.list_conversations();
        assert_eq!(before, after);
        let run_id =
            crate::features::runs::domain::RunId::new(started.snapshot.run_id).expect("run id");
        assert_eq!(
            supervisor.snapshot(&run_id).expect("known run").status,
            RunStatus::Failed
        );
    }
}
