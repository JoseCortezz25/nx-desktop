//! OpenCode adapter tests against fake executables (issue #27).
//!
//! No test runs the real `opencode` binary or reaches the network: each test
//! writes a `/bin/sh` script that answers `api ... model.list` with a canned
//! catalog and `run ...` with canned JSON lines, records its argv, stdin,
//! working directory, environment and pid, and stalls when a test needs to
//! exercise cancellation or timeouts.

#![cfg(unix)]

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use super::config::{DEFAULT_EFFORT_STOP, OpenCodeConfig};
use super::test_support::{TempDir, fake_binary};
use super::workspace::WorkspaceDirectory;
use super::*;
use crate::features::conversations::domain::{
    ConversationId, ToolCall, ToolCallKind, ToolCallStatus,
};
use crate::features::projects::domain::ProjectId;
use crate::features::providers::adapters::fake::FakeAgentProvider;
use crate::features::providers::service::ProviderRegistry;
use crate::features::runs::domain::{
    RunEnvironment, RunEvent, RunFailureCode, RunFrame, RunPrompt, StartRunSpec,
};
use crate::features::runs::ports::RunEventSink;
use crate::features::runs::supervisor::RunSupervisor;

const MODEL_LIST: &str = r#"{"location":{"directory":"/tmp"},"data":[
{"id":"claude-opus-5-5","providerID":"anthropic","name":"Claude Opus 5.5","headers":{"x-api-key":"sk-never-leaks"},"variants":[{"id":"high"},{"id":"max"}]},
{"id":"mimo-v2.6-flash","providerID":"opencode-go","name":"MiMo V2.6 Flash","variants":[]}
]}"#;

const PROMPT: &str = "--help me; $(rm -rf /) refactor the supervisor";

struct StaticWorkspace(Option<PathBuf>);

impl WorkspaceDirectory for StaticWorkspace {
    fn directory(&self, _project_id: &str) -> Option<PathBuf> {
        self.0.clone()
    }
}

/// A fake OpenCode install: a temp dir with the script and its recordings.
struct Fake {
    dir: TempDir,
    workspace: TempDir,
    binary: PathBuf,
}

impl Fake {
    /// `run_body` is the shell the script executes for `opencode run`, after
    /// it recorded its inputs and pid.
    fn new(run_body: &str) -> Self {
        Self::with_discovery(&format!("cat <<'JSON'\n{MODEL_LIST}\nJSON"), run_body)
    }

    fn with_discovery(discovery_body: &str, run_body: &str) -> Self {
        let dir = TempDir::new("fake");
        let workspace = TempDir::new("workspace");
        let d = dir.path().display();
        let body = format!(
            r#"D='{d}'
if [ "$1" = "warmup" ]; then
  exit 0
fi
if [ "$1" = "api" ]; then
  printf '%s\n' "$*" >> "$D/discovery-args"
  echo $$ > "$D/discovery-pid"
  {discovery_body}
  exit 0
fi
printf '%s\n' "$@" > "$D/run-args"
cat > "$D/stdin"
pwd > "$D/pwd"
env > "$D/env"
echo $$ > "$D/pid"
{run_body}"#
        );
        let binary = fake_binary(dir.path(), &body);
        // Execute the fresh script once so first-exec latency (e.g. the
        // macOS executable assessment of a new file) never eats into the
        // short timeouts the tests below exercise.
        let warmed = std::process::Command::new(&binary)
            .arg("warmup")
            .status()
            .expect("fake binary runs");
        assert!(warmed.success());
        Self {
            dir,
            workspace,
            binary,
        }
    }

    fn config(&self) -> OpenCodeConfig {
        OpenCodeConfig {
            binary: Some(self.binary.clone()),
            discovery_timeout: Duration::from_secs(10),
            idle_timeout: Duration::from_secs(10),
            exit_timeout: Duration::from_secs(2),
            cancel_grace: Duration::from_millis(500),
            ..OpenCodeConfig::default()
        }
    }

    fn adapter(&self) -> OpenCodeAgentProvider {
        self.adapter_with(self.config())
    }

    fn adapter_with(&self, config: OpenCodeConfig) -> OpenCodeAgentProvider {
        OpenCodeAgentProvider::new(
            config,
            Arc::new(StaticWorkspace(Some(self.workspace.path().to_path_buf()))),
        )
        .expect("adapter builds")
    }

    fn recorded(&self, name: &str) -> String {
        std::fs::read_to_string(self.dir.path().join(name)).unwrap_or_default()
    }

    fn file(&self, name: &str) -> PathBuf {
        self.dir.path().join(name)
    }
}

fn spec(model: &str, effort: &str) -> StartRunSpec {
    StartRunSpec {
        conversation_id: ConversationId::new("conv-opencode").expect("id"),
        project_id: ProjectId::new("proj-opencode").expect("id"),
        provider_id: ProviderId::new("opencode").expect("id"),
        model_id: ModelId::new(model).expect("id"),
        effort_level: EffortLevel::new(effort).expect("stop"),
        prompt: RunPrompt::new(PROMPT).expect("prompt"),
        environment: RunEnvironment::new(false, "main", "local").expect("environment"),
    }
}

fn request(model: &str, effort: &str) -> RunExecutionRequest {
    RunExecutionRequest::from_spec(&spec(model, effort))
}

#[derive(Default)]
struct RecordingSink {
    text: Mutex<Vec<String>>,
    tools: Mutex<Vec<ToolCall>>,
}

impl RecordingSink {
    fn text(&self) -> Vec<String> {
        self.text
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }

    fn tools(&self) -> Vec<ToolCall> {
        self.tools
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }
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

async fn run(
    adapter: &OpenCodeAgentProvider,
    model: &str,
    effort: &str,
) -> (Result<(), RunFailure>, Arc<RecordingSink>) {
    let sink = Arc::new(RecordingSink::default());
    let outcome = tokio::time::timeout(
        Duration::from_secs(20),
        adapter.execute(request(model, effort), Cancellation::new(), sink.clone()),
    )
    .await
    .expect("run finishes");
    (outcome, sink)
}

fn model_ids(adapter: &OpenCodeAgentProvider) -> Vec<String> {
    adapter.catalog()[0]
        .available_models
        .iter()
        .map(|model| model.id.as_str().to_owned())
        .collect()
}

fn pid_in(path: &Path) -> Option<i32> {
    std::fs::read_to_string(path).ok()?.trim().parse().ok()
}

async fn wait_for_file(path: &Path) {
    let deadline = Instant::now() + Duration::from_secs(10);
    while !path.exists() || std::fs::metadata(path).map(|m| m.len()).unwrap_or(0) == 0 {
        assert!(
            Instant::now() < deadline,
            "{} never appeared",
            path.display()
        );
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}

/// Polls until `pid` no longer exists (killed and reaped by its parent or
/// by init).
async fn assert_process_gone(pid: i32) {
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        // SAFETY: signal 0 only probes for existence.
        let alive = unsafe { libc::kill(pid, 0) } == 0;
        if !alive {
            return;
        }
        assert!(Instant::now() < deadline, "process {pid} is still alive");
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}

const HAPPY_RUN: &str = r#"echo 'Warning: stray diagnostic line'
echo '{"type":"step_start","timestamp":1,"sessionID":"ses_1","part":{"type":"step-start"}}'
echo '{"type":"text","timestamp":2,"sessionID":"ses_1","part":{"type":"text","text":"Reading the supervisor."}}'
echo '{"type":"tool_use","timestamp":3,"sessionID":"ses_1","part":{"partID":"prt_9","type":"tool","tool":"bash","state":{"status":"completed","input":{"command":"ls"},"output":"secret-output"}}}'
echo '{"type":"step_finish","timestamp":4,"sessionID":"ses_1","part":{"type":"step-finish","reason":"tool-calls"}}'
echo '{"type":"text","timestamp":5,"sessionID":"ses_1","part":{"type":"text","text":"Done."}}'
echo '{"type":"step_finish","timestamp":6,"sessionID":"ses_1","part":{"type":"step-finish","reason":"stop"}}'
exit 0"#;

// --- discovery -----------------------------------------------------------

#[tokio::test]
async fn discovers_models_and_variants_from_opencode() {
    let fake = Fake::new("exit 0");
    let adapter = fake.adapter();
    assert!(model_ids(&adapter).is_empty(), "nothing before discovery");
    adapter.ready().await;

    assert_eq!(
        fake.recorded("discovery-args").trim(),
        "api --standalone model.list"
    );
    let provider = &adapter.catalog()[0];
    assert_eq!(provider.id.as_str(), "opencode");
    let models: Vec<(String, String, Vec<String>)> = provider
        .available_models
        .iter()
        .map(|model| {
            (
                model.id.as_str().to_owned(),
                model.display_name.clone(),
                model
                    .supported_effort_levels
                    .iter()
                    .map(|stop| stop.as_str().to_owned())
                    .collect(),
            )
        })
        .collect();
    assert_eq!(
        models,
        vec![
            (
                "anthropic/claude-opus-5-5".to_owned(),
                "Claude Opus 5.5 (anthropic)".to_owned(),
                vec!["high".to_owned(), "max".to_owned()],
            ),
            (
                "opencode-go/mimo-v2.6-flash".to_owned(),
                "MiMo V2.6 Flash (opencode-go)".to_owned(),
                vec![DEFAULT_EFFORT_STOP.to_owned()],
            ),
        ]
    );
    assert!(!format!("{provider:?}").contains("sk-never-leaks"));
}

#[tokio::test]
async fn a_fresh_cache_is_served_without_rediscovery_and_refreshes_are_single_flight() {
    let fake = Fake::with_discovery(
        &format!("sleep 0.3\ncat <<'JSON'\n{MODEL_LIST}\nJSON"),
        "exit 0",
    );
    let adapter = fake.adapter();
    tokio::join!(adapter.ready(), adapter.ready(), adapter.ready());
    adapter.ready().await;
    assert_eq!(
        fake.recorded("discovery-args").lines().count(),
        1,
        "concurrent and fresh listings share one discovery"
    );
    assert_eq!(model_ids(&adapter).len(), 2);
}

#[tokio::test]
async fn a_missing_binary_lists_the_provider_without_models() {
    let config = OpenCodeConfig {
        binary: Some(PathBuf::from("/nx-desktop-missing/bin/opencode")),
        ..OpenCodeConfig::default()
    };
    let adapter =
        OpenCodeAgentProvider::new(config, Arc::new(StaticWorkspace(None))).expect("builds");
    tokio::time::timeout(Duration::from_secs(2), adapter.ready())
        .await
        .expect("a missing binary fails fast");
    let catalog = adapter.catalog();
    assert_eq!(catalog.len(), 1);
    assert_eq!(catalog[0].id.as_str(), "opencode");
    assert!(catalog[0].available_models.is_empty());

    let (outcome, _) = run(&adapter, "anthropic/claude-opus-5-5", "high").await;
    assert_eq!(
        outcome.expect_err("no model offered").code,
        RunFailureCode::Internal
    );
}

#[tokio::test]
async fn failed_discovery_degrades_to_an_empty_catalog() {
    for discovery in ["echo 'not json'", "echo '{\"data\":[]}'; exit 3"] {
        let fake = Fake::with_discovery(discovery, "exit 0");
        let adapter = fake.adapter();
        adapter.ready().await;
        assert!(model_ids(&adapter).is_empty(), "{discovery}");
    }
}

#[tokio::test]
async fn a_failed_refresh_keeps_the_last_good_catalog() {
    let fake = Fake::new("exit 0");
    let adapter = fake.adapter();
    adapter.ready().await;
    assert_eq!(model_ids(&adapter).len(), 2);
    // Replace the binary with one whose discovery fails, then force a refresh.
    fake_binary(fake.dir.path(), "exit 1");
    adapter.refresh().await;
    assert_eq!(model_ids(&adapter).len(), 2);
}

#[tokio::test]
async fn discovery_is_bounded_by_its_timeout_and_kills_the_child() {
    let fake = Fake::with_discovery("sleep 30 & echo $! > \"$D/sleep-pid\"; wait", "exit 0");
    let config = OpenCodeConfig {
        discovery_timeout: Duration::from_millis(1500),
        ..fake.config()
    };
    let adapter = fake.adapter_with(config);
    let started = Instant::now();
    adapter.ready().await;
    assert!(started.elapsed() < Duration::from_secs(5));
    assert!(model_ids(&adapter).is_empty());
    let shell = pid_in(&fake.file("discovery-pid")).expect("discovery pid recorded");
    assert_process_gone(shell).await;
    if let Some(sleeper) = pid_in(&fake.file("sleep-pid")) {
        assert_process_gone(sleeper).await;
    }
}

#[tokio::test]
async fn the_registry_lists_the_discovered_models_in_place_of_the_fixture_row() {
    let fake = Fake::new("exit 0");
    let adapter = Arc::new(fake.adapter());
    let registry = ProviderRegistry::new(&FakeAgentProvider).with_live_source(adapter);
    registry.ready().await;
    let providers = registry.list_providers();
    let ids: Vec<&str> = providers.iter().map(|p| p.id.as_str()).collect();
    assert_eq!(ids, vec!["opencode", "codex"]);
    assert_eq!(providers[0].available_models.len(), 2);
    assert_eq!(
        registry.validate_selection(
            &ProviderId::new("opencode").expect("id"),
            &ModelId::new("opencode-go/mimo-v2.6-flash").expect("id"),
            &EffortLevel::new(DEFAULT_EFFORT_STOP).expect("stop"),
        ),
        Ok(())
    );
}

// --- runs ----------------------------------------------------------------

#[tokio::test]
async fn streams_text_and_tool_activity_from_json_lines() {
    let fake = Fake::new(HAPPY_RUN);
    let adapter = fake.adapter();
    adapter.ready().await;
    let (outcome, sink) = run(&adapter, "anthropic/claude-opus-5-5", "max").await;
    assert_eq!(outcome, Ok(()));
    assert_eq!(sink.text(), vec!["Reading the supervisor.", "\n\nDone."]);
    let tools = sink.tools();
    assert_eq!(tools.len(), 1);
    assert_eq!(tools[0].id, "prt_9");
    assert_eq!(tools[0].kind, ToolCallKind::Command);
    assert_eq!(tools[0].status, ToolCallStatus::Completed);
    assert!(!tools[0].detail.contains("secret-output"));
}

#[tokio::test]
async fn spawns_with_explicit_args_stdin_prompt_workspace_cwd_and_a_cleared_env() {
    let fake = Fake::new(HAPPY_RUN);
    let adapter = fake.adapter();
    adapter.ready().await;
    let (outcome, _) = run(&adapter, "anthropic/claude-opus-5-5", "max").await;
    assert_eq!(outcome, Ok(()));

    let args: Vec<String> = fake
        .recorded("run-args")
        .lines()
        .map(str::to_owned)
        .collect();
    assert_eq!(
        args,
        vec![
            "run",
            "--standalone",
            "--format",
            "json",
            "--model",
            "anthropic/claude-opus-5-5#max"
        ]
    );
    assert_eq!(
        fake.recorded("stdin"),
        PROMPT,
        "the prompt goes through stdin"
    );
    let workspace = fake.workspace.path().display().to_string();
    assert_eq!(fake.recorded("pwd").trim(), workspace);
    let env = fake.recorded("env");
    assert!(env.lines().any(|line| line == format!("PWD={workspace}")));
    assert!(env.lines().any(|line| line == "NO_COLOR=1"));
    assert!(
        !env.contains("CARGO_PKG_NAME="),
        "variables outside the allowlist are not forwarded"
    );
}

#[tokio::test]
async fn a_model_without_variants_runs_without_a_suffix() {
    let fake = Fake::new(HAPPY_RUN);
    let adapter = fake.adapter();
    adapter.ready().await;
    let (outcome, _) = run(&adapter, "opencode-go/mimo-v2.6-flash", DEFAULT_EFFORT_STOP).await;
    assert_eq!(outcome, Ok(()));
    assert!(
        fake.recorded("run-args")
            .lines()
            .any(|line| line == "opencode-go/mimo-v2.6-flash")
    );
}

#[tokio::test]
async fn an_error_event_maps_without_leaking_the_vendor_message() {
    let fake = Fake::new(
        r#"echo '{"type":"text","part":{"text":"partial"}}'
echo '{"type":"error","timestamp":1,"sessionID":"ses_1","error":{"name":"APIError","data":{"message":"invalid x-api-key sk-live-123","statusCode":401,"isRetryable":false}}}'
exit 1"#,
    );
    let adapter = fake.adapter();
    adapter.ready().await;
    let (outcome, sink) = run(&adapter, "anthropic/claude-opus-5-5", "high").await;
    let failure = outcome.expect_err("the run fails");
    assert_eq!(failure.code, RunFailureCode::ProviderUnavailable);
    assert!(failure.message.contains("401"));
    assert!(!failure.message.contains("sk-live-123"));
    assert_eq!(sink.text(), vec!["partial"]);
}

#[tokio::test]
async fn a_malformed_event_fails_the_run_as_internal() {
    let fake = Fake::new(
        r#"echo '{"type":"text","part":{"text":"ok"'
sleep 30"#,
    );
    let adapter = fake.adapter();
    adapter.ready().await;
    let started = Instant::now();
    let (outcome, _) = run(&adapter, "anthropic/claude-opus-5-5", "high").await;
    assert_eq!(
        outcome.expect_err("malformed").code,
        RunFailureCode::Internal
    );
    assert!(started.elapsed() < Duration::from_secs(15));
}

#[tokio::test]
async fn a_non_zero_exit_without_an_event_is_internal() {
    let fake = Fake::new("exit 2");
    let adapter = fake.adapter();
    adapter.ready().await;
    let (outcome, _) = run(&adapter, "anthropic/claude-opus-5-5", "high").await;
    let failure = outcome.expect_err("exit 2 fails");
    assert_eq!(failure.code, RunFailureCode::Internal);
    assert!(failure.message.contains('2'));
}

#[tokio::test]
async fn unknown_models_unadvertised_stops_and_missing_workspaces_fail_before_spawning() {
    let fake = Fake::new(HAPPY_RUN);
    let adapter = fake.adapter();
    adapter.ready().await;
    let (unknown, _) = run(&adapter, "anthropic/not-a-model", "high").await;
    assert_eq!(unknown.expect_err("unknown").code, RunFailureCode::Internal);
    let (stop, _) = run(&adapter, "anthropic/claude-opus-5-5", "standard").await;
    assert_eq!(stop.expect_err("stop").code, RunFailureCode::Internal);
    let (default_on_variants, _) =
        run(&adapter, "anthropic/claude-opus-5-5", DEFAULT_EFFORT_STOP).await;
    assert!(default_on_variants.is_err());

    let no_workspace =
        OpenCodeAgentProvider::new(fake.config(), Arc::new(StaticWorkspace(None))).expect("builds");
    no_workspace.ready().await;
    let (outcome, _) = run(&no_workspace, "anthropic/claude-opus-5-5", "high").await;
    let failure = outcome.expect_err("no workspace");
    assert_eq!(failure.code, RunFailureCode::Internal);
    assert!(failure.message.contains("workspace"));
    assert!(
        !fake.file("run-args").exists(),
        "no process was started for a rejected run"
    );
}

#[tokio::test]
async fn a_binary_removed_after_discovery_is_provider_unavailable() {
    let fake = Fake::new(HAPPY_RUN);
    let adapter = fake.adapter();
    adapter.ready().await;
    std::fs::remove_file(&fake.binary).expect("remove fake binary");
    let (outcome, _) = run(&adapter, "anthropic/claude-opus-5-5", "high").await;
    let failure = outcome.expect_err("binary gone");
    assert_eq!(failure.code, RunFailureCode::ProviderUnavailable);
    assert!(failure.message.contains("NX_DESKTOP_OPENCODE_BIN"));
}

#[tokio::test]
async fn a_stalled_stream_times_out_and_kills_the_process() {
    let fake = Fake::new("sleep 30 & echo $! > \"$D/sleep-pid\"; wait");
    let config = OpenCodeConfig {
        idle_timeout: Duration::from_millis(500),
        ..fake.config()
    };
    let adapter = fake.adapter_with(config);
    adapter.ready().await;
    let (outcome, _) = run(&adapter, "anthropic/claude-opus-5-5", "high").await;
    assert_eq!(
        outcome.expect_err("stalled").code,
        RunFailureCode::ProviderUnavailable
    );
    assert_process_gone(pid_in(&fake.file("pid")).expect("pid")).await;
    assert_process_gone(pid_in(&fake.file("sleep-pid")).expect("sleep pid")).await;
}

async fn cancel_mid_run(fake: &Fake) -> (Result<(), RunFailure>, Duration) {
    let adapter = Arc::new(fake.adapter());
    adapter.ready().await;
    let cancellation = Cancellation::new();
    let sink = Arc::new(RecordingSink::default());
    let task = {
        let adapter = Arc::clone(&adapter);
        let cancellation = cancellation.clone();
        let sink = sink.clone();
        tokio::spawn(async move {
            adapter
                .execute(
                    request("anthropic/claude-opus-5-5", "high"),
                    cancellation,
                    sink,
                )
                .await
        })
    };
    wait_for_file(&fake.file("sleep-pid")).await;
    let cancelled_at = Instant::now();
    cancellation.cancel();
    let outcome = tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .expect("cancellation returns promptly")
        .expect("task joins");
    (outcome, cancelled_at.elapsed())
}

#[tokio::test]
async fn cancellation_interrupts_a_cooperative_run() {
    // Like OpenCode, the script handles SIGINT by stopping its work and
    // exiting 130.
    let fake = Fake::new(
        r#"echo '{"type":"text","part":{"text":"working"}}'
trap 'kill $SLEEPER; exit 130' INT
sleep 30 & SLEEPER=$!
echo $SLEEPER > "$D/sleep-pid"
wait"#,
    );
    let (outcome, elapsed) = cancel_mid_run(&fake).await;
    assert_eq!(outcome, Err(RunFailure::cancelled()));
    assert!(elapsed < Duration::from_millis(450), "{elapsed:?}");
    assert_process_gone(pid_in(&fake.file("pid")).expect("pid")).await;
    assert_process_gone(pid_in(&fake.file("sleep-pid")).expect("sleep pid")).await;
}

#[tokio::test]
async fn cancellation_kills_the_whole_group_when_sigint_is_ignored() {
    let fake = Fake::new(
        r#"trap '' INT
sleep 30 & echo $! > "$D/sleep-pid"
wait"#,
    );
    let (outcome, elapsed) = cancel_mid_run(&fake).await;
    assert_eq!(outcome, Err(RunFailure::cancelled()));
    assert!(
        elapsed >= Duration::from_millis(400),
        "waited for the grace"
    );
    assert!(elapsed < Duration::from_secs(5), "{elapsed:?}");
    assert_process_gone(pid_in(&fake.file("pid")).expect("pid")).await;
    assert_process_gone(pid_in(&fake.file("sleep-pid")).expect("sleep pid")).await;
}

#[tokio::test]
async fn dropping_a_run_kills_its_process_group() {
    let fake = Fake::new("sleep 30 & echo $! > \"$D/sleep-pid\"; wait");
    let adapter = fake.adapter();
    adapter.ready().await;
    let sink = Arc::new(RecordingSink::default());
    let run = adapter.execute(
        request("anthropic/claude-opus-5-5", "high"),
        Cancellation::new(),
        sink,
    );
    let _ = tokio::time::timeout(Duration::from_millis(600), run).await;
    // The timed-out future was dropped here.
    assert_process_gone(pid_in(&fake.file("pid")).expect("pid")).await;
    assert_process_gone(pid_in(&fake.file("sleep-pid")).expect("sleep pid")).await;
}

#[derive(Default)]
struct FrameSink {
    frames: Mutex<Vec<RunFrame>>,
}

impl RunEventSink for FrameSink {
    fn emit(&self, frame: RunFrame) {
        self.frames
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .push(frame);
    }
}

#[tokio::test]
async fn the_supervisor_emits_the_same_frame_kinds_as_with_the_fake_runner() {
    let fake = Fake::new(HAPPY_RUN);
    let adapter = Arc::new(fake.adapter());
    adapter.ready().await;
    let supervisor = RunSupervisor::new(adapter);
    let sink = Arc::new(FrameSink::default());
    let started = supervisor.start(spec("anthropic/claude-opus-5-5", "high"), sink.clone());
    tokio::time::timeout(Duration::from_secs(20), started.driver)
        .await
        .expect("driver finishes");
    let frames = sink
        .frames
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone();
    let seqs: Vec<u64> = frames.iter().map(|frame| frame.seq).collect();
    assert_eq!(seqs, vec![1, 2, 3, 4, 5]);
    let kinds: Vec<&str> = frames
        .iter()
        .map(|frame| match &frame.event {
            RunEvent::Started => "started",
            RunEvent::TextDelta { .. } => "textDelta",
            RunEvent::ToolActivity { .. } => "toolActivity",
            RunEvent::Completed => "completed",
            RunEvent::Failed { .. } => "failed",
            RunEvent::Cancelled => "cancelled",
        })
        .collect();
    assert_eq!(
        kinds,
        vec![
            "started",
            "textDelta",
            "toolActivity",
            "textDelta",
            "completed"
        ]
    );
}
