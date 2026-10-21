//! Codex adapter tests against fake `codex` executables (issue #26).
//!
//! No test runs the real CLI: each test writes a small `/bin/sh` script into
//! its own temp directory and points the adapter at it. The scripts emit
//! canned `codex exec --json` lines, record what they received (argv, stdin,
//! cwd, environment) and can stall to exercise cancellation and timeouts.

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use super::config::CodexConfig;
use super::workspace::WorkspaceResolver;
use super::*;
use crate::features::conversations::domain::{ConversationId, ToolCall, ToolCallStatus};
use crate::features::projects::domain::ProjectId;
use crate::features::runs::domain::{
    RunEnvironment, RunEvent, RunFailureCode, RunFrame, RunPrompt, StartRunSpec,
};
use crate::features::runs::ports::RunEventSink;
use crate::features::runs::supervisor::RunSupervisor;

const SECRET: &str = "sk-openai-secret-never-forwarded";
const PROMPT: &str = "Explain the run supervisor; --model evil $(rm -rf /)";

static NEXT_DIR: AtomicUsize = AtomicUsize::new(0);

/// A temp directory holding a fake `codex` script and a workspace folder.
struct Fixture {
    dir: PathBuf,
    workspace: PathBuf,
    binary: PathBuf,
}

impl Fixture {
    fn new(script_body: &str) -> Self {
        let dir = std::env::temp_dir().join(format!(
            "nx-codex-test-{}-{}",
            std::process::id(),
            NEXT_DIR.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = std::fs::remove_dir_all(&dir);
        let workspace = dir.join("workspace");
        std::fs::create_dir_all(&workspace).expect("fixture dirs");
        let dir = std::fs::canonicalize(dir).expect("canonical fixture dir");
        let workspace = dir.join("workspace");
        let bin_dir = dir.join("bin");
        std::fs::create_dir_all(&bin_dir).expect("bin dir");
        let binary = bin_dir.join("codex");
        let script = format!(
            "#!/bin/sh\nOUT='{}'\n{script_body}\n",
            dir.to_string_lossy()
        );
        std::fs::write(&binary, script).expect("write fake codex");
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o755))
            .expect("chmod fake codex");
        Self {
            dir,
            workspace,
            binary,
        }
    }

    fn read(&self, name: &str) -> String {
        std::fs::read_to_string(self.dir.join(name)).unwrap_or_default()
    }

    fn adapter(&self) -> CodexAgentProvider {
        self.adapter_with(CodexConfig {
            binary: Some(self.binary.clone()),
            idle_timeout: Duration::from_secs(10),
            exit_grace: Duration::from_millis(500),
            ..CodexConfig::default()
        })
    }

    fn adapter_with(&self, config: CodexConfig) -> CodexAgentProvider {
        CodexAgentProvider::with_env(
            config,
            Arc::new(FixedWorkspace(Some(self.workspace.clone()))),
            test_env(None),
        )
        .expect("adapter builds")
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

struct FixedWorkspace(Option<PathBuf>);

impl WorkspaceResolver for FixedWorkspace {
    fn workspace_root(&self, _project_id: &str) -> Option<PathBuf> {
        self.0.clone()
    }
}

/// The real `PATH`/`HOME` plus secrets that must never reach the child.
fn test_env(path_override: Option<PathBuf>) -> EnvLookup {
    Box::new(move |name| match name {
        "PATH" => path_override
            .clone()
            .map(PathBuf::into_os_string)
            .or_else(|| std::env::var_os("PATH")),
        "HOME" => std::env::var_os("HOME"),
        "OPENAI_API_KEY" | "CODEX_API_KEY" | "ANTHROPIC_API_KEY" => Some(OsString::from(SECRET)),
        _ => None,
    })
}

/// `PATH` led by `dir`, keeping the system tools the scripts use.
fn path_with(dir: Option<&Path>) -> PathBuf {
    let mut dirs: Vec<PathBuf> = dir.map(Path::to_path_buf).into_iter().collect();
    dirs.extend(["/usr/bin", "/bin"].map(PathBuf::from));
    PathBuf::from(std::env::join_paths(dirs).expect("joinable PATH"))
}

fn spec(model: &str, effort: &str) -> StartRunSpec {
    StartRunSpec {
        conversation_id: ConversationId::new("conv-codex").expect("id"),
        project_id: ProjectId::new("proj-codex").expect("id"),
        provider_id: ProviderId::new("codex").expect("id"),
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
    cancel_on_first_text: Option<Cancellation>,
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
        if let Some(cancellation) = &self.cancel_on_first_text {
            cancellation.cancel();
        }
    }

    fn tool_activity(&self, tool_call: ToolCall) {
        self.tools
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .push(tool_call);
    }
}

/// Emits the given JSONL lines verbatim (single-quoted heredoc).
fn emit(lines: &[&str]) -> String {
    format!("cat <<'JSONL'\n{}\nJSONL", lines.join("\n"))
}

const HAPPY_LINES: &[&str] = &[
    r#"{"type":"thread.started","thread_id":"0199a213-81c0-7800-8aa1-bbab2a035a53"}"#,
    r#"{"type":"turn.started"}"#,
    r#"{"type":"item.completed","item":{"id":"item_0","type":"reasoning","text":"Looking around"}}"#,
    r#"{"type":"item.started","item":{"id":"item_1","type":"command_execution","command":"bash -lc ls","aggregated_output":"","status":"in_progress"}}"#,
    r#"{"type":"item.completed","item":{"id":"item_1","type":"command_execution","command":"bash -lc ls","aggregated_output":"src\n","exit_code":0,"status":"completed"}}"#,
    r#"{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"Hi"}}"#,
    r#"{"type":"item.completed","item":{"id":"item_3","type":"agent_message","text":"there"}}"#,
    r#"{"type":"turn.completed","usage":{"input_tokens":24763,"cached_input_tokens":24448,"output_tokens":122}}"#,
];

fn recording_script(lines: &[&str]) -> String {
    format!(
        "printf '%s\\n' \"$@\" > \"$OUT/args.txt\"\ncat > \"$OUT/stdin.txt\"\nenv > \"$OUT/env.txt\"\npwd -P > \"$OUT/cwd.txt\"\n{}",
        emit(lines)
    )
}

#[tokio::test]
async fn streams_text_and_tool_activity_until_turn_completed() {
    let fixture = Fixture::new(&recording_script(HAPPY_LINES));
    let sink = Arc::new(RecordingSink::default());
    fixture
        .adapter()
        .execute(
            request("gpt-6-sol", "high"),
            Cancellation::new(),
            sink.clone(),
        )
        .await
        .expect("turn completes");
    assert_eq!(sink.text(), vec!["Hi".to_owned(), "\n\nthere".to_owned()]);
    let statuses: Vec<(String, ToolCallStatus)> = sink
        .tools()
        .into_iter()
        .map(|tool| (tool.id, tool.status))
        .collect();
    assert_eq!(
        statuses,
        vec![
            ("item_1".to_owned(), ToolCallStatus::Running),
            ("item_1".to_owned(), ToolCallStatus::Completed),
        ]
    );
}

#[tokio::test]
async fn spawns_with_explicit_args_stdin_prompt_workspace_cwd_and_minimal_env() {
    let fixture = Fixture::new(&recording_script(HAPPY_LINES));
    fixture
        .adapter()
        .execute(
            request("gpt-6.1-sol", "ultra"),
            Cancellation::new(),
            Arc::new(RecordingSink::default()),
        )
        .await
        .expect("turn completes");

    let workspace = fixture.workspace.to_string_lossy().into_owned();
    let args: Vec<String> = fixture
        .read("args.txt")
        .lines()
        .map(str::to_owned)
        .collect();
    assert_eq!(
        args,
        vec![
            "exec",
            "--json",
            "--color",
            "never",
            "--sandbox",
            "read-only",
            "-c",
            "approval_policy=\"never\"",
            "--skip-git-repo-check",
            "--ephemeral",
            "--model",
            "gpt-6.1-sol",
            "-c",
            "model_reasoning_effort=\"ultra\"",
            "--cd",
            workspace.as_str(),
            "-",
        ]
    );
    // The prompt travels only through stdin, byte for byte, never in argv.
    assert_eq!(fixture.read("stdin.txt"), PROMPT);
    assert!(!fixture.read("args.txt").contains("Explain"));
    assert_eq!(fixture.read("cwd.txt").trim(), workspace);

    let env = fixture.read("env.txt");
    assert!(!env.contains(SECRET), "secrets must not reach the child");
    assert!(!env.contains("OPENAI_API_KEY"));
    assert!(!env.contains("ANTHROPIC_API_KEY"));
    let bin_dir = fixture
        .binary
        .parent()
        .expect("bin dir")
        .to_string_lossy()
        .into_owned();
    assert!(
        env.lines()
            .any(|line| line.starts_with(&format!("PATH={bin_dir}"))),
        "PATH is led by the binary's directory"
    );
}

#[tokio::test]
async fn resolves_codex_from_path_when_no_override_is_set() {
    let fixture = Fixture::new(&emit(HAPPY_LINES));
    let adapter = CodexAgentProvider::with_env(
        CodexConfig {
            binary: None,
            idle_timeout: Duration::from_secs(10),
            exit_grace: Duration::from_millis(500),
            ..CodexConfig::default()
        },
        Arc::new(FixedWorkspace(Some(fixture.workspace.clone()))),
        test_env(Some(path_with(fixture.binary.parent()))),
    )
    .expect("adapter builds");
    adapter
        .execute(
            request("gpt-6-sol", "low"),
            Cancellation::new(),
            Arc::new(RecordingSink::default()),
        )
        .await
        .expect("PATH resolution finds the fake binary");
}

#[tokio::test]
async fn a_missing_binary_is_provider_unavailable() {
    let fixture = Fixture::new("exit 0");
    let failure = fixture
        .adapter_with(CodexConfig {
            binary: Some(fixture.dir.join("not-installed").join("codex")),
            ..CodexConfig::default()
        })
        .execute(
            request("gpt-6-sol", "high"),
            Cancellation::new(),
            Arc::new(RecordingSink::default()),
        )
        .await
        .expect_err("no binary");
    assert_eq!(failure.code, RunFailureCode::ProviderUnavailable);
    assert!(failure.message.contains("NX_CODEX_BIN"));
}

#[tokio::test]
async fn cancellation_terminates_a_stalled_cli_and_its_children() {
    let fixture = Fixture::new(&format!(
        "cat > /dev/null\necho $$ > \"$OUT/pid\"\nsleep 60 &\necho $! > \"$OUT/grandchild\"\n{}\nwait",
        emit(&[
            r#"{"type":"thread.started","thread_id":"t"}"#,
            r#"{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"first"}}"#,
        ])
    ));
    let cancellation = Cancellation::new();
    let sink = Arc::new(RecordingSink {
        cancel_on_first_text: Some(cancellation.clone()),
        ..RecordingSink::default()
    });
    let failure = tokio::time::timeout(
        Duration::from_secs(5),
        fixture
            .adapter()
            .execute(request("gpt-6-sol", "high"), cancellation, sink.clone()),
    )
    .await
    .expect("cancellation returns promptly")
    .expect_err("cancelled");
    assert_eq!(failure.code, RunFailureCode::Cancelled);
    assert_eq!(sink.text(), vec!["first".to_owned()]);

    for name in ["pid", "grandchild"] {
        let pid: libc::pid_t = fixture.read(name).trim().parse().expect("pid recorded");
        assert!(
            eventually_dead(pid).await,
            "{name} {pid} must be terminated"
        );
    }
}

async fn eventually_dead(pid: libc::pid_t) -> bool {
    for _ in 0..50 {
        // SAFETY: signal 0 only probes for existence; it delivers nothing.
        if unsafe { libc::kill(pid, 0) } != 0 {
            return true;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    false
}

#[tokio::test]
async fn a_silent_cli_is_abandoned_after_the_idle_timeout() {
    let fixture = Fixture::new("cat > /dev/null\nexec sleep 60");
    let failure = fixture
        .adapter_with(CodexConfig {
            binary: Some(fixture.binary.clone()),
            idle_timeout: Duration::from_millis(300),
            exit_grace: Duration::from_millis(200),
            ..CodexConfig::default()
        })
        .execute(
            request("gpt-6-sol", "high"),
            Cancellation::new(),
            Arc::new(RecordingSink::default()),
        )
        .await
        .expect_err("stalled");
    assert_eq!(failure.code, RunFailureCode::ProviderUnavailable);
    assert!(failure.message.contains("stopped producing events"));
}

#[tokio::test]
async fn a_malformed_line_fails_the_run_as_internal() {
    let fixture = Fixture::new(&format!(
        "cat > /dev/null\n{}",
        emit(&[
            r#"{"type":"turn.started"}"#,
            "this is not json",
            r#"{"type":"turn.completed"}"#,
        ])
    ));
    let failure = fixture
        .adapter()
        .execute(
            request("gpt-6-sol", "high"),
            Cancellation::new(),
            Arc::new(RecordingSink::default()),
        )
        .await
        .expect_err("malformed");
    assert_eq!(failure.code, RunFailureCode::Internal);
    assert!(failure.message.contains("malformed"));
}

#[tokio::test]
async fn turn_failed_maps_without_leaking_the_vendor_message() {
    let fixture = Fixture::new(&format!(
        "cat > /dev/null\n{}",
        emit(&[
            r#"{"type":"turn.started"}"#,
            r#"{"type":"turn.failed","error":{"message":"You've hit your usage limit. sk-openai-secret-never-forwarded"}}"#,
        ])
    ));
    let failure = fixture
        .adapter()
        .execute(
            request("gpt-6-sol", "high"),
            Cancellation::new(),
            Arc::new(RecordingSink::default()),
        )
        .await
        .expect_err("turn failed");
    assert_eq!(failure.code, RunFailureCode::ProviderUnavailable);
    assert!(failure.message.contains("limit"));
    assert!(!failure.message.contains(SECRET));
}

#[tokio::test]
async fn a_non_zero_exit_is_classified_from_stderr_without_forwarding_it() {
    let fixture = Fixture::new(
        "cat > /dev/null\necho 'Error: Not logged in (sk-openai-secret-never-forwarded). Run codex login.' >&2\nexit 1",
    );
    let failure = fixture
        .adapter()
        .execute(
            request("gpt-6-sol", "high"),
            Cancellation::new(),
            Arc::new(RecordingSink::default()),
        )
        .await
        .expect_err("not logged in");
    assert_eq!(failure.code, RunFailureCode::ProviderUnavailable);
    assert!(failure.message.contains("codex login"));
    assert!(!failure.message.contains(SECRET));
}

#[tokio::test]
async fn a_clean_exit_before_turn_completed_is_a_truncated_stream() {
    let fixture = Fixture::new(&format!(
        "cat > /dev/null\n{}",
        emit(&[r#"{"type":"turn.started"}"#])
    ));
    let failure = fixture
        .adapter()
        .execute(
            request("gpt-6-sol", "high"),
            Cancellation::new(),
            Arc::new(RecordingSink::default()),
        )
        .await
        .expect_err("truncated");
    assert_eq!(failure.code, RunFailureCode::ProviderUnavailable);
    assert!(failure.message.contains("before the turn completed"));
}

#[tokio::test]
async fn a_missing_workspace_or_unknown_model_never_spawns() {
    let fixture = Fixture::new("touch \"$OUT/spawned\"\nexit 0");
    let no_workspace = CodexAgentProvider::with_env(
        CodexConfig {
            binary: Some(fixture.binary.clone()),
            ..CodexConfig::default()
        },
        Arc::new(FixedWorkspace(None)),
        test_env(None),
    )
    .expect("adapter builds");
    let failure = no_workspace
        .execute(
            request("gpt-6-sol", "high"),
            Cancellation::new(),
            Arc::new(RecordingSink::default()),
        )
        .await
        .expect_err("no workspace");
    assert_eq!(failure.code, RunFailureCode::Internal);

    for (model, effort) in [("gpt-5-codex", "high"), ("gpt-6-astra", "high")] {
        let failure = fixture
            .adapter()
            .execute(
                request(model, effort),
                Cancellation::new(),
                Arc::new(RecordingSink::default()),
            )
            .await
            .expect_err("rejected selection");
        assert_eq!(failure.code, RunFailureCode::Internal, "{model} {effort}");
    }
    assert!(!fixture.dir.join("spawned").exists());
}

#[test]
fn the_catalog_lists_codex_models_from_rust_configuration() {
    let adapter = CodexAgentProvider::with_env(
        CodexConfig::default(),
        Arc::new(FixedWorkspace(None)),
        test_env(None),
    )
    .expect("adapter builds");
    let catalog = adapter.catalog();
    assert_eq!(catalog.len(), 1);
    let provider = &catalog[0];
    assert_eq!(provider.id.as_str(), "codex");
    let models: Vec<(&str, Vec<&str>)> = provider
        .available_models
        .iter()
        .map(|model| {
            (
                model.id.as_str(),
                model
                    .supported_effort_levels
                    .iter()
                    .map(EffortLevel::as_str)
                    .collect(),
            )
        })
        .collect();
    assert_eq!(
        models,
        vec![
            (
                "gpt-6.1-sol",
                vec!["low", "medium", "high", "xhigh", "max", "ultra"]
            ),
            ("gpt-6-astra", vec!["low", "medium", "xhigh"]),
            ("gpt-6-sol", vec!["low", "medium", "high", "xhigh", "max"]),
            ("gpt-6-luna", vec!["low", "medium", "high", "xhigh", "max"]),
        ]
    );
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
    let fixture = Fixture::new(&format!(
        "cat > /dev/null\n{}",
        emit(&[
            r#"{"type":"thread.started","thread_id":"t"}"#,
            r#"{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"Hi"}}"#,
            r#"{"type":"turn.completed","usage":{}}"#,
        ])
    ));
    let supervisor = RunSupervisor::new(Arc::new(fixture.adapter()));
    let sink = Arc::new(FrameSink::default());
    let started = supervisor.start(spec("gpt-6-sol", "high"), sink.clone());
    tokio::time::timeout(Duration::from_secs(5), started.driver)
        .await
        .expect("driver finishes");
    let frames = sink
        .frames
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone();
    let seqs: Vec<u64> = frames.iter().map(|frame| frame.seq).collect();
    assert_eq!(seqs, vec![1, 2, 3]);
    let events: Vec<RunEvent> = frames.into_iter().map(|frame| frame.event).collect();
    assert_eq!(
        events,
        vec![
            RunEvent::Started,
            RunEvent::TextDelta {
                text: "Hi".to_owned()
            },
            RunEvent::Completed,
        ]
    );
}
