//! Claude adapter tests against a local mock HTTP server (issue #25).
//!
//! No test reaches the real API: every run targets a `127.0.0.1` listener
//! that serves a canned response, captures the request and reports when the
//! client hangs up.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;

use super::config::{CLAUDE_MODELS, ClaudeConfig};
use super::*;
use crate::features::conversations::domain::{ConversationId, ToolCall};
use crate::features::projects::domain::ProjectId;
use crate::features::providers::adapters::env_credentials::EnvCredentialSource;
use crate::features::providers::domain::ProviderCredential;
use crate::features::runs::domain::{
    RunEnvironment, RunEvent, RunFailureCode, RunFrame, RunPrompt, StartRunSpec,
};
use crate::features::runs::ports::RunEventSink;
use crate::features::runs::supervisor::RunSupervisor;

const TEST_KEY: &str = "sk-ant-test-key-never-leaks";

struct StaticCredential(Option<&'static str>);

impl CredentialSource for StaticCredential {
    fn resolve(&self, _provider_id: &ProviderId) -> Option<ProviderCredential> {
        self.0.and_then(ProviderCredential::new)
    }
}

fn adapter(base_url: &str, key: Option<&'static str>) -> ClaudeAgentProvider {
    let config = ClaudeConfig {
        base_url: base_url.to_owned(),
        idle_timeout: Duration::from_secs(5),
        ..ClaudeConfig::default()
    };
    ClaudeAgentProvider::new(config, Arc::new(StaticCredential(key))).expect("adapter builds")
}

fn request(model: &str, effort: &str) -> RunExecutionRequest {
    RunExecutionRequest::from_spec(&spec(model, effort))
}

fn spec(model: &str, effort: &str) -> StartRunSpec {
    StartRunSpec {
        conversation_id: ConversationId::new("conv-claude").expect("id"),
        project_id: ProjectId::new("proj-claude").expect("id"),
        provider_id: ProviderId::new("claude").expect("id"),
        model_id: ModelId::new(model).expect("id"),
        effort_level: EffortLevel::new(effort).expect("stop"),
        prompt: RunPrompt::new("Explain the run supervisor.").expect("prompt"),
        environment: RunEnvironment::new(false, "main", "local").expect("environment"),
    }
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

fn sse(event: &str, data: &str) -> String {
    format!("event: {event}\ndata: {data}\n\n")
}

fn text_stream(parts: &[&str], stop_reason: &str) -> Vec<String> {
    let mut events = vec![
        sse(
            "message_start",
            r#"{"type":"message_start","message":{"id":"msg_1","usage":{"input_tokens":5}}}"#,
        ),
        sse(
            "content_block_start",
            r#"{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}"#,
        ),
        sse("ping", r#"{"type": "ping"}"#),
    ];
    for part in parts {
        events.push(sse(
            "content_block_delta",
            &format!(
                r#"{{"type":"content_block_delta","index":0,"delta":{{"type":"text_delta","text":"{part}"}}}}"#
            ),
        ));
    }
    events.push(sse(
        "content_block_stop",
        r#"{"type":"content_block_stop","index":0}"#,
    ));
    events.push(sse(
        "message_delta",
        &format!(
            r#"{{"type":"message_delta","delta":{{"stop_reason":"{stop_reason}"}},"usage":{{"output_tokens":9}}}}"#
        ),
    ));
    events.push(sse("message_stop", r#"{"type":"message_stop"}"#));
    events
}

/// What the mock server does after reading the request.
enum Script {
    /// Serve `status` with these body chunks, then close.
    Respond {
        status: &'static str,
        content_type: &'static str,
        chunks: Vec<String>,
    },
    /// Serve the head plus these chunks, then hold the connection open and
    /// report when the client disconnects.
    StallAfter { chunks: Vec<String> },
}

struct MockServer {
    base_url: String,
    request: oneshot::Receiver<String>,
    disconnected: oneshot::Receiver<()>,
}

async fn mock_server(script: Script) -> MockServer {
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
    let address = listener.local_addr().expect("address");
    let (request_tx, request) = oneshot::channel();
    let (disconnected_tx, disconnected) = oneshot::channel();
    tokio::spawn(async move {
        let Ok((mut socket, _)) = listener.accept().await else {
            return;
        };
        let captured = read_request(&mut socket).await;
        let _ = request_tx.send(captured);
        match script {
            Script::Respond {
                status,
                content_type,
                chunks,
            } => {
                let head = format!(
                    "HTTP/1.1 {status}\r\ncontent-type: {content_type}\r\nconnection: close\r\n\r\n"
                );
                let _ = socket.write_all(head.as_bytes()).await;
                for chunk in chunks {
                    // Split each event mid-way so the client parser must
                    // reassemble across TCP reads.
                    let (left, right) = chunk.split_at(chunk.len() / 2);
                    let _ = socket.write_all(left.as_bytes()).await;
                    let _ = socket.flush().await;
                    tokio::time::sleep(Duration::from_millis(2)).await;
                    let _ = socket.write_all(right.as_bytes()).await;
                    let _ = socket.flush().await;
                }
                let _ = socket.shutdown().await;
            }
            Script::StallAfter { chunks } => {
                let head = "HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\nconnection: close\r\n\r\n";
                let _ = socket.write_all(head.as_bytes()).await;
                for chunk in chunks {
                    let _ = socket.write_all(chunk.as_bytes()).await;
                }
                let _ = socket.flush().await;
                let mut buffer = [0_u8; 64];
                loop {
                    match socket.read(&mut buffer).await {
                        Ok(0) | Err(_) => break,
                        Ok(_) => {}
                    }
                }
                let _ = disconnected_tx.send(());
            }
        }
    });
    MockServer {
        base_url: format!("http://{address}"),
        request,
        disconnected,
    }
}

/// Reads one HTTP/1.1 request (head + `content-length` body).
async fn read_request(socket: &mut TcpStream) -> String {
    let mut data = Vec::new();
    let mut buffer = [0_u8; 4096];
    while let Ok(read) = socket.read(&mut buffer).await {
        if read == 0 {
            break;
        }
        data.extend_from_slice(&buffer[..read]);
        let text = String::from_utf8_lossy(&data);
        if let Some(head_end) = text.find("\r\n\r\n") {
            let length = text[..head_end]
                .lines()
                .find_map(|line| {
                    let (name, value) = line.split_once(':')?;
                    name.eq_ignore_ascii_case("content-length")
                        .then(|| value.trim().parse::<usize>().ok())
                        .flatten()
                })
                .unwrap_or(0);
            if data.len() >= head_end + 4 + length {
                break;
            }
        }
    }
    String::from_utf8_lossy(&data).into_owned()
}

fn body_of(request: &str) -> serde_json::Value {
    let (_, body) = request.split_once("\r\n\r\n").expect("request has a body");
    serde_json::from_str(body).expect("request body is JSON")
}

#[test]
fn catalog_lists_claude_with_the_configured_models() {
    let adapter = adapter("http://127.0.0.1:9", None);
    let catalog = adapter.catalog();
    assert_eq!(catalog.len(), 1);
    let provider = &catalog[0];
    assert_eq!(provider.id.as_str(), "claude");
    assert_eq!(provider.display_name, "Claude");
    let models: Vec<(&str, &str)> = provider
        .available_models
        .iter()
        .map(|model| (model.id.as_str(), model.display_name.as_str()))
        .collect();
    assert_eq!(
        models,
        vec![
            ("claude-opus-5-5", "Claude Opus 5.5"),
            ("claude-sonnet-5-5", "Claude Sonnet 5.5"),
            ("claude-haiku-5-5", "Claude Haiku 5.5"),
        ]
    );
    let efforts: Vec<&str> = provider.available_models[0]
        .supported_effort_levels
        .iter()
        .map(EffortLevel::as_str)
        .collect();
    assert_eq!(efforts, vec!["low", "medium", "high", "xhigh", "max"]);
    assert_eq!(CLAUDE_MODELS.len(), provider.available_models.len());
}

#[tokio::test]
async fn missing_credentials_fail_before_any_network_call() {
    // Port 9 (discard) is never contacted: the failure must be the
    // credential one, not a transport error.
    let adapter = ClaudeAgentProvider::new(
        ClaudeConfig {
            base_url: "http://127.0.0.1:9".to_owned(),
            ..ClaudeConfig::default()
        },
        Arc::new(EnvCredentialSource::with_lookup(Box::new(|_| None))),
    )
    .expect("adapter builds");
    let sink = Arc::new(RecordingSink::default());
    let result = adapter
        .execute(
            request("claude-opus-5-5", "high"),
            Cancellation::new(),
            sink.clone(),
        )
        .await;
    let failure = result.expect_err("no credential configured");
    assert_eq!(failure, errors::missing_credential());
    assert_eq!(failure.code, RunFailureCode::ProviderUnavailable);
    assert!(sink.text().is_empty());
}

#[tokio::test]
async fn unknown_models_and_efforts_fail_without_a_request() {
    let adapter = adapter("http://127.0.0.1:9", Some(TEST_KEY));
    let sink: Arc<dyn RunProgressSink> = Arc::new(RecordingSink::default());
    let model = adapter
        .execute(
            request("claude-unknown", "high"),
            Cancellation::new(),
            sink.clone(),
        )
        .await
        .expect_err("unknown model");
    assert_eq!(model.code, RunFailureCode::Internal);
    let effort = adapter
        .execute(
            request("claude-opus-5-5", "standard"),
            Cancellation::new(),
            sink,
        )
        .await
        .expect_err("foreign effort stop");
    assert_eq!(effort.code, RunFailureCode::Internal);
}

#[tokio::test]
async fn streams_text_in_order_and_sends_the_documented_request() {
    let server = mock_server(Script::Respond {
        status: "200 OK",
        content_type: "text/event-stream",
        chunks: text_stream(&["Hello", ", ", "world"], "end_turn"),
    })
    .await;
    let adapter = adapter(&server.base_url, Some(TEST_KEY));
    let sink = Arc::new(RecordingSink::default());
    let result = adapter
        .execute(
            request("claude-sonnet-5-5", "xhigh"),
            Cancellation::new(),
            sink.clone(),
        )
        .await;
    assert_eq!(result, Ok(()));
    assert_eq!(sink.text(), vec!["Hello", ", ", "world"]);

    let captured = server.request.await.expect("request captured");
    let lower = captured.to_ascii_lowercase();
    assert!(lower.starts_with("post /v1/messages http/1.1"));
    assert!(lower.contains(&format!("x-api-key: {TEST_KEY}")));
    assert!(lower.contains("anthropic-version: 2023-06-01"));
    assert!(lower.contains("content-type: application/json"));
    let body = body_of(&captured);
    assert_eq!(body["model"], "claude-sonnet-5-5");
    assert_eq!(body["max_tokens"], 64_000);
    assert_eq!(body["stream"], true);
    assert_eq!(body["output_config"]["effort"], "xhigh");
    assert_eq!(body["messages"][0]["role"], "user");
    assert_eq!(
        body["messages"][0]["content"],
        "Explain the run supervisor."
    );
    assert!(body.get("thinking").is_none());
}

#[tokio::test]
async fn cancellation_stops_consuming_the_stream_and_closes_the_connection() {
    let first = text_stream(&["first"], "end_turn");
    // Serve only up to the first text delta, then hold the stream open.
    let server = mock_server(Script::StallAfter {
        chunks: first[..4].to_vec(),
    })
    .await;
    let adapter = adapter(&server.base_url, Some(TEST_KEY));
    let cancellation = Cancellation::new();
    let sink = Arc::new(RecordingSink {
        cancel_on_first_text: Some(cancellation.clone()),
        ..RecordingSink::default()
    });
    let result = tokio::time::timeout(
        Duration::from_secs(2),
        adapter.execute(
            request("claude-opus-5-5", "high"),
            cancellation,
            sink.clone(),
        ),
    )
    .await
    .expect("cancellation returns promptly instead of waiting on the stall");
    assert_eq!(result, Err(RunFailure::cancelled()));
    assert_eq!(sink.text(), vec!["first"]);
    tokio::time::timeout(Duration::from_secs(2), server.disconnected)
        .await
        .expect("the client drops the connection after cancellation")
        .expect("server observed the hang-up");
}

#[tokio::test]
async fn http_errors_map_to_safe_failures() {
    let server = mock_server(Script::Respond {
        status: "429 Too Many Requests",
        content_type: "application/json",
        chunks: vec![format!(
            r#"{{"type":"error","error":{{"type":"rate_limit_error","message":"slow down {TEST_KEY}"}}}}"#
        )],
    })
    .await;
    let adapter = adapter(&server.base_url, Some(TEST_KEY));
    let failure = adapter
        .execute(
            request("claude-haiku-5-5", "low"),
            Cancellation::new(),
            Arc::new(RecordingSink::default()),
        )
        .await
        .expect_err("rate limited");
    assert_eq!(failure.code, RunFailureCode::ProviderUnavailable);
    assert!(failure.message.contains("rate_limit_error"));
    assert!(!failure.message.contains(TEST_KEY));
    assert!(!failure.message.contains("slow down"));
}

#[tokio::test]
async fn non_success_stop_reasons_fail_the_run() {
    let server = mock_server(Script::Respond {
        status: "200 OK",
        content_type: "text/event-stream",
        chunks: text_stream(&["partial"], "max_tokens"),
    })
    .await;
    let adapter = adapter(&server.base_url, Some(TEST_KEY));
    let failure = adapter
        .execute(
            request("claude-opus-5-5", "max"),
            Cancellation::new(),
            Arc::new(RecordingSink::default()),
        )
        .await
        .expect_err("max_tokens must not silently succeed");
    assert!(failure.message.contains("max_tokens"));
}

#[tokio::test]
async fn a_stream_that_ends_before_message_stop_fails() {
    let mut chunks = text_stream(&["cut"], "end_turn");
    chunks.truncate(4);
    let server = mock_server(Script::Respond {
        status: "200 OK",
        content_type: "text/event-stream",
        chunks,
    })
    .await;
    let adapter = adapter(&server.base_url, Some(TEST_KEY));
    let failure = adapter
        .execute(
            request("claude-opus-5-5", "high"),
            Cancellation::new(),
            Arc::new(RecordingSink::default()),
        )
        .await
        .expect_err("truncated stream");
    assert_eq!(failure, errors::truncated_stream());
}

#[tokio::test]
async fn stream_error_events_fail_the_run() {
    let mut chunks = text_stream(&["before"], "end_turn");
    chunks.truncate(4);
    chunks.push(sse(
        "error",
        r#"{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}"#,
    ));
    let server = mock_server(Script::Respond {
        status: "200 OK",
        content_type: "text/event-stream",
        chunks,
    })
    .await;
    let adapter = adapter(&server.base_url, Some(TEST_KEY));
    let failure = adapter
        .execute(
            request("claude-opus-5-5", "high"),
            Cancellation::new(),
            Arc::new(RecordingSink::default()),
        )
        .await
        .expect_err("overloaded mid-stream");
    assert_eq!(failure.code, RunFailureCode::ProviderUnavailable);
    assert!(failure.message.contains("overloaded_error"));
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
    let server = mock_server(Script::Respond {
        status: "200 OK",
        content_type: "text/event-stream",
        chunks: text_stream(&["Hi", " there"], "end_turn"),
    })
    .await;
    let supervisor = RunSupervisor::new(Arc::new(adapter(&server.base_url, Some(TEST_KEY))));
    let sink = Arc::new(FrameSink::default());
    let started = supervisor.start(spec("claude-opus-5-5", "high"), sink.clone());
    tokio::time::timeout(Duration::from_secs(5), started.driver)
        .await
        .expect("driver finishes");
    let frames = sink
        .frames
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone();
    let seqs: Vec<u64> = frames.iter().map(|frame| frame.seq).collect();
    assert_eq!(seqs, vec![1, 2, 3, 4]);
    let events: Vec<RunEvent> = frames.into_iter().map(|frame| frame.event).collect();
    assert_eq!(
        events,
        vec![
            RunEvent::Started,
            RunEvent::TextDelta {
                text: "Hi".to_owned()
            },
            RunEvent::TextDelta {
                text: " there".to_owned()
            },
            RunEvent::Completed,
        ]
    );
}
