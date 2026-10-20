//! Run supervisor (issue #19).
//!
//! Owns every active run in the Rust core: identity, lifecycle status, the
//! monotonic frame sequence, the cancellation signal and the driver task that
//! runs an adapter. React never owns this state; `get_run` reads the snapshot
//! here on panel reopen (`business-logic.md` §3.2,
//! `.opencode/rules/state-and-concurrency.md` §1).
//!
//! Lock discipline:
//!
//! - The run map lock is held only to insert or clone one `Arc<RunHandle>`;
//!   it is never alive across the adapter `.await`.
//! - The per-run lock arbitrates lifecycle transitions and allocates the next
//!   sequence number. It is a `std::sync::Mutex`, so it cannot be held across
//!   an `.await` — the driver awaits with no guard alive.
//! - The sink is called while that short guard is alive (a non-blocking
//!   `Channel::send`). Sinks must not call back into the supervisor.
//!
//! Terminal-state rule: the first `claim_terminal` wins; every later claim and
//! every progress frame after the terminal frame is dropped, so exactly one
//! terminal event is emitted and the channel sink is released with it.
//!
//! Terminal records stay in the map so [`RunSupervisor::snapshot`] can answer
//! after a panel reopens. The sink, the driver task and the cancellation signal
//! are released at the terminal frame; only the small metadata record remains,
//! and pruning it is a retention decision outside this ticket.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use super::domain::{
    RunEvent, RunFailure, RunFailureCode, RunFrame, RunId, RunSnapshot, RunStatus, StartRunSpec,
};
use super::ports::{
    AgentRunner, BoxFuture, Cancellation, RunEventSink, RunExecutionRequest, RunProgressSink,
};
use crate::features::conversations::domain::ToolCall;

/// Future that drives one run to its terminal state.
///
/// The command spawns it on Tauri's runtime; tests spawn it on Tokio. The
/// supervisor itself never depends on either runtime.
pub type RunDriver = BoxFuture<'static, ()>;

/// The run's initial snapshot plus the task that produces its stream.
pub struct StartedRun {
    pub snapshot: RunSnapshot,
    pub driver: RunDriver,
}

impl std::fmt::Debug for StartedRun {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("StartedRun")
            .field("snapshot", &self.snapshot)
            .field("driver", &"<run driver>")
            .finish()
    }
}

/// Long-lived owner of the active run map.
pub struct RunSupervisor {
    runner: Arc<dyn AgentRunner>,
    runs: Mutex<HashMap<String, Arc<RunHandle>>>,
    next_run_id: AtomicU64,
}

impl RunSupervisor {
    pub fn new(runner: Arc<dyn AgentRunner>) -> Self {
        Self {
            runner,
            runs: Mutex::new(HashMap::new()),
            next_run_id: AtomicU64::new(0),
        }
    }

    /// Registers one run in `pending` and returns its snapshot plus the
    /// driver future. Nothing is awaited here, so the command can return the
    /// pending snapshot before the first frame.
    pub fn start(&self, spec: StartRunSpec, sink: Arc<dyn RunEventSink>) -> StartedRun {
        let sequence = self.next_run_id.fetch_add(1, Ordering::Relaxed) + 1;
        let handle = Arc::new(RunHandle::new(
            format!("run-{sequence:08x}"),
            spec.conversation_id.as_str().to_owned(),
            spec.project_id.as_str().to_owned(),
            sink,
        ));
        lock_or_recover(&self.runs).insert(handle.run_id.clone(), Arc::clone(&handle));

        let snapshot = handle.snapshot();
        let execution = RunExecutionRequest::from_spec(&spec);
        let runner = Arc::clone(&self.runner);
        let driver_handle = Arc::clone(&handle);
        let driver: RunDriver = Box::pin(async move {
            if !driver_handle.begin() {
                return;
            }
            let progress: Arc<dyn RunProgressSink> = driver_handle.clone();
            let outcome = runner
                .execute(execution, driver_handle.cancellation.clone(), progress)
                .await;
            match outcome {
                Ok(()) => {
                    driver_handle.claim_terminal(RunStatus::Completed, None);
                }
                Err(failure) if failure.code == RunFailureCode::Cancelled => {
                    driver_handle.claim_terminal(RunStatus::Cancelled, None);
                }
                Err(failure) => {
                    driver_handle.claim_terminal(RunStatus::Failed, Some(failure));
                }
            }
        });

        StartedRun { snapshot, driver }
    }

    /// Authoritative snapshot of one run, or `None` when the id is unknown.
    pub fn snapshot(&self, run_id: &RunId) -> Option<RunSnapshot> {
        self.find(run_id).map(|handle| handle.snapshot())
    }

    /// Cancels one run. Idempotent: an unknown id returns `None`, a terminal
    /// run returns its current terminal snapshot without emitting a new frame.
    ///
    /// The cancellation signal fires before the terminal claim so a driver
    /// already between frames observes it; both paths request `cancelled`, so
    /// whichever reaches the lock first produces the same outcome.
    pub fn cancel(&self, run_id: &RunId) -> Option<RunSnapshot> {
        let handle = self.find(run_id)?;
        handle.cancellation.cancel();
        handle.claim_terminal(RunStatus::Cancelled, None);
        Some(handle.snapshot())
    }

    fn find(&self, run_id: &RunId) -> Option<Arc<RunHandle>> {
        lock_or_recover(&self.runs).get(run_id.as_str()).cloned()
    }
}

struct RunHandle {
    run_id: String,
    conversation_id: String,
    project_id: String,
    cancellation: Cancellation,
    stream: Mutex<RunStreamState>,
}

struct RunStreamState {
    status: RunStatus,
    seq: u64,
    sink: Option<Arc<dyn RunEventSink>>,
}

impl RunHandle {
    fn new(
        run_id: String,
        conversation_id: String,
        project_id: String,
        sink: Arc<dyn RunEventSink>,
    ) -> Self {
        Self {
            run_id,
            conversation_id,
            project_id,
            cancellation: Cancellation::new(),
            stream: Mutex::new(RunStreamState {
                status: RunStatus::Pending,
                seq: 0,
                sink: Some(sink),
            }),
        }
    }

    fn snapshot(&self) -> RunSnapshot {
        let state = lock_or_recover(&self.stream);
        RunSnapshot {
            run_id: self.run_id.clone(),
            conversation_id: self.conversation_id.clone(),
            project_id: self.project_id.clone(),
            status: state.status,
        }
    }

    /// Moves `pending → streaming` and emits `started`. Returns `false` when
    /// the run was already terminal (for example, cancelled before the driver
    /// took its first step).
    fn begin(&self) -> bool {
        let mut state = lock_or_recover(&self.stream);
        if state.status != RunStatus::Pending {
            return false;
        }
        state.status = RunStatus::Streaming;
        self.emit(&mut state, RunEvent::Started);
        true
    }

    fn emit_progress(&self, event: RunEvent) {
        let mut state = lock_or_recover(&self.stream);
        if state.status != RunStatus::Streaming {
            return;
        }
        self.emit(&mut state, event);
    }

    /// Resolves the run to its single terminal state. The first caller wins;
    /// later callers return `false` and emit nothing. The sink is taken with
    /// the terminal frame so the transport and its webview callback are freed
    /// as soon as the stream ends.
    fn claim_terminal(&self, status: RunStatus, failure: Option<RunFailure>) -> bool {
        let mut state = lock_or_recover(&self.stream);
        if state.status.is_terminal() {
            return false;
        }
        let event = match status {
            RunStatus::Completed => RunEvent::Completed,
            RunStatus::Cancelled => RunEvent::Cancelled,
            RunStatus::Failed => RunEvent::Failed {
                failure: failure.unwrap_or_else(|| {
                    RunFailure::internal("run failed without a diagnostic summary")
                }),
            },
            RunStatus::Pending | RunStatus::Streaming => return false,
        };
        state.status = status;
        self.emit(&mut state, event);
        state.sink = None;
        true
    }

    /// Allocates the next sequence number and hands the frame to the sink.
    /// The caller holds the short stream guard; the sink contract forbids
    /// re-entering the supervisor.
    fn emit(&self, state: &mut RunStreamState, event: RunEvent) {
        state.seq += 1;
        let frame = RunFrame {
            run_id: self.run_id.clone(),
            seq: state.seq,
            event,
        };
        if let Some(sink) = &state.sink {
            sink.emit(frame);
        }
    }
}

impl RunProgressSink for RunHandle {
    fn text_delta(&self, text: String) {
        self.emit_progress(RunEvent::TextDelta { text });
    }

    fn tool_activity(&self, tool_call: ToolCall) {
        self.emit_progress(RunEvent::ToolActivity { tool_call });
    }
}

fn lock_or_recover<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;
    use crate::features::conversations::domain::{
        ConversationId, ToolCall, ToolCallKind, ToolCallStatus,
    };
    use crate::features::projects::domain::ProjectId;
    use crate::features::providers::domain::{EffortLevel, ModelId, ProviderId};
    use crate::features::runs::domain::{RunEnvironment, RunPrompt};
    use tokio::sync::Notify;

    #[derive(Default)]
    struct RecordingSink {
        frames: Mutex<Vec<RunFrame>>,
    }

    impl RunEventSink for RecordingSink {
        fn emit(&self, frame: RunFrame) {
            lock_or_recover(&self.frames).push(frame);
        }
    }

    impl RecordingSink {
        fn frames(&self) -> Vec<RunFrame> {
            lock_or_recover(&self.frames).clone()
        }

        fn events(&self) -> Vec<RunEvent> {
            self.frames().into_iter().map(|frame| frame.event).collect()
        }
    }

    #[derive(Clone)]
    enum Step {
        Text(&'static str),
        Tool,
        Fail(RunFailure),
    }

    struct ScriptedRunner {
        steps: Vec<Step>,
        wait_for_cancellation: bool,
        waiting: Option<Arc<Notify>>,
    }

    impl ScriptedRunner {
        fn new(steps: Vec<Step>) -> Self {
            Self {
                steps,
                wait_for_cancellation: false,
                waiting: None,
            }
        }

        fn waiting_for_cancellation(waiting: Arc<Notify>) -> Self {
            Self {
                steps: Vec::new(),
                wait_for_cancellation: true,
                waiting: Some(waiting),
            }
        }
    }

    impl AgentRunner for ScriptedRunner {
        fn execute<'a>(
            &'a self,
            _request: RunExecutionRequest,
            cancellation: Cancellation,
            sink: Arc<dyn RunProgressSink>,
        ) -> BoxFuture<'a, Result<(), RunFailure>> {
            Box::pin(async move {
                for step in &self.steps {
                    match step {
                        Step::Text(text) => sink.text_delta((*text).to_owned()),
                        Step::Tool => sink.tool_activity(tool_call()),
                        Step::Fail(failure) => return Err(failure.clone()),
                    }
                }
                if self.wait_for_cancellation {
                    if let Some(waiting) = &self.waiting {
                        waiting.notify_one();
                    }
                    cancellation.cancelled().await;
                    return Err(RunFailure::cancelled());
                }
                Ok(())
            })
        }
    }

    /// Completes immediately but keeps the progress sink, so a test can prove
    /// post-terminal frames are dropped.
    struct LeakyRunner {
        sink: Mutex<Option<Arc<dyn RunProgressSink>>>,
    }

    impl LeakyRunner {
        fn new() -> Self {
            Self {
                sink: Mutex::new(None),
            }
        }
    }

    impl AgentRunner for LeakyRunner {
        fn execute<'a>(
            &'a self,
            _request: RunExecutionRequest,
            _cancellation: Cancellation,
            sink: Arc<dyn RunProgressSink>,
        ) -> BoxFuture<'a, Result<(), RunFailure>> {
            *lock_or_recover(&self.sink) = Some(sink);
            Box::pin(async { Ok(()) })
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

    fn tool_call() -> ToolCall {
        ToolCall {
            id: "tool-run-1".to_owned(),
            kind: ToolCallKind::Search,
            summary: "Searched src for the selection chain".to_owned(),
            detail: "Matched selection-chain.ts and the composer organisms.".to_owned(),
            status: ToolCallStatus::Completed,
            subagent_id: None,
        }
    }

    async fn drive(driver: RunDriver) {
        tokio::time::timeout(Duration::from_secs(2), driver)
            .await
            .expect("driver finishes before the test timeout");
    }

    #[tokio::test]
    async fn start_publishes_started_progress_and_one_completed_terminal() {
        let runner = Arc::new(ScriptedRunner::new(vec![Step::Text("hello"), Step::Tool]));
        let supervisor = RunSupervisor::new(runner);
        let sink = Arc::new(RecordingSink::default());
        let started = supervisor.start(spec(), sink.clone());
        assert_eq!(started.snapshot.status, RunStatus::Pending);

        drive(started.driver).await;

        let frames = sink.frames();
        assert_eq!(
            frames
                .iter()
                .map(|frame| frame.event.clone())
                .collect::<Vec<_>>(),
            vec![
                RunEvent::Started,
                RunEvent::TextDelta {
                    text: "hello".to_owned()
                },
                RunEvent::ToolActivity {
                    tool_call: tool_call()
                },
                RunEvent::Completed,
            ]
        );
        assert_eq!(
            frames.iter().map(|frame| frame.seq).collect::<Vec<_>>(),
            vec![1, 2, 3, 4]
        );
        let run_id = RunId::new(started.snapshot.run_id).expect("run id");
        assert_eq!(
            supervisor.snapshot(&run_id).expect("known run").status,
            RunStatus::Completed
        );
    }

    #[tokio::test]
    async fn start_uses_monotonic_run_ids() {
        let supervisor = RunSupervisor::new(Arc::new(ScriptedRunner::new(Vec::new())));
        let sink = Arc::new(RecordingSink::default());
        let first = supervisor.start(spec(), sink.clone());
        let second = supervisor.start(spec(), sink);
        assert_eq!(first.snapshot.run_id, "run-00000001");
        assert_eq!(second.snapshot.run_id, "run-00000002");
        drive(first.driver).await;
        drive(second.driver).await;
    }

    #[tokio::test]
    async fn cancel_stops_the_stream_and_emits_exactly_one_cancelled() {
        let waiting = Arc::new(Notify::new());
        let runner = Arc::new(ScriptedRunner::waiting_for_cancellation(Arc::clone(
            &waiting,
        )));
        let supervisor = RunSupervisor::new(runner);
        let sink = Arc::new(RecordingSink::default());
        let started = supervisor.start(spec(), sink.clone());
        let run_id = RunId::new(started.snapshot.run_id.clone()).expect("run id");
        let driver = tokio::spawn(started.driver);

        waiting.notified().await;
        assert_eq!(
            supervisor.snapshot(&run_id).expect("known run").status,
            RunStatus::Streaming
        );

        let cancelled = supervisor.cancel(&run_id).expect("known run");
        assert_eq!(cancelled.status, RunStatus::Cancelled);
        tokio::time::timeout(Duration::from_secs(2), driver)
            .await
            .expect("driver stops")
            .expect("driver task joins");

        let events = sink.events();
        assert_eq!(events.first(), Some(&RunEvent::Started));
        assert_eq!(events.last(), Some(&RunEvent::Cancelled));
        assert_eq!(
            events
                .iter()
                .filter(|event| **event == RunEvent::Cancelled)
                .count(),
            1
        );
        assert_eq!(
            supervisor.snapshot(&run_id).expect("known run").status,
            RunStatus::Cancelled
        );
    }

    #[tokio::test]
    async fn cancel_is_idempotent() {
        let waiting = Arc::new(Notify::new());
        let runner = Arc::new(ScriptedRunner::waiting_for_cancellation(Arc::clone(
            &waiting,
        )));
        let supervisor = RunSupervisor::new(runner);
        let sink = Arc::new(RecordingSink::default());
        let started = supervisor.start(spec(), sink.clone());
        let run_id = RunId::new(started.snapshot.run_id.clone()).expect("run id");
        let driver = tokio::spawn(started.driver);
        waiting.notified().await;

        assert_eq!(
            supervisor.cancel(&run_id).expect("known run").status,
            RunStatus::Cancelled
        );
        assert_eq!(
            supervisor.cancel(&run_id).expect("known run").status,
            RunStatus::Cancelled
        );
        tokio::time::timeout(Duration::from_secs(2), driver)
            .await
            .expect("driver stops")
            .expect("driver task joins");
        assert_eq!(
            sink.events()
                .iter()
                .filter(|event| **event == RunEvent::Cancelled)
                .count(),
            1
        );
    }

    #[tokio::test]
    async fn cancel_does_not_rewrite_a_completed_run() {
        let supervisor = RunSupervisor::new(Arc::new(ScriptedRunner::new(Vec::new())));
        let sink = Arc::new(RecordingSink::default());
        let started = supervisor.start(spec(), sink.clone());
        let run_id = RunId::new(started.snapshot.run_id.clone()).expect("run id");
        drive(started.driver).await;

        let after_cancel = supervisor.cancel(&run_id).expect("known run");
        assert_eq!(after_cancel.status, RunStatus::Completed);
        assert!(!sink.events().contains(&RunEvent::Cancelled));
    }

    #[tokio::test]
    async fn adapter_failure_is_the_single_terminal_state() {
        let failure = RunFailure::provider_unavailable("provider adapter did not respond");
        let runner = Arc::new(ScriptedRunner::new(vec![Step::Fail(failure.clone())]));
        let supervisor = RunSupervisor::new(runner);
        let sink = Arc::new(RecordingSink::default());
        let started = supervisor.start(spec(), sink.clone());
        let run_id = RunId::new(started.snapshot.run_id).expect("run id");
        drive(started.driver).await;

        assert_eq!(
            supervisor.snapshot(&run_id).expect("known run").status,
            RunStatus::Failed
        );
        assert_eq!(
            sink.events(),
            vec![RunEvent::Started, RunEvent::Failed { failure }]
        );
    }

    #[tokio::test]
    async fn progress_frames_after_the_terminal_state_are_dropped() {
        let runner = Arc::new(LeakyRunner::new());
        let supervisor = RunSupervisor::new(runner.clone());
        let sink = Arc::new(RecordingSink::default());
        let started = supervisor.start(spec(), sink.clone());
        drive(started.driver).await;
        let before = sink.frames().len();

        let leaked = lock_or_recover(&runner.sink)
            .clone()
            .expect("runner kept the progress sink");
        leaked.text_delta("too late".to_owned());

        assert_eq!(sink.frames().len(), before);
    }

    #[tokio::test]
    async fn unknown_runs_have_no_snapshot_and_cannot_be_cancelled() {
        let supervisor = RunSupervisor::new(Arc::new(ScriptedRunner::new(Vec::new())));
        let run_id = RunId::new("run-ffffffff").expect("run id");
        assert!(supervisor.snapshot(&run_id).is_none());
        assert!(supervisor.cancel(&run_id).is_none());
    }
}
