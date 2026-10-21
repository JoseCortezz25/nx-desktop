//! Codex CLI turn driver (issue #26).
//!
//! Spawns one `codex exec --json` child, writes the prompt to its stdin and
//! pumps its JSONL stdout through the framer and translator into the run
//! progress sink.
//!
//! Cancellation: writing the prompt, reading each stdout chunk and waiting
//! for the exit all race the run's [`Cancellation`]. When it fires, the
//! process group receives `SIGTERM`, gets [`CodexConfig::exit_grace`] to
//! exit, and is then killed with `SIGKILL` by the [`ChildGuard`] drop — so
//! the CLI and every command it spawned stop, and no further frame is
//! forwarded. A cancel that lands mid-chunk is re-checked before each frame.
//! There is no lock in the adapter, so nothing is held across `.await`.
//!
//! Secrets and vendor text: stderr is drained into a bounded tail that is
//! only *inspected* to classify an abnormal exit; it is never forwarded,
//! logged or put into a failure.

use std::time::Duration;

use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};
use tokio::task::JoinHandle;

use super::config::CodexConfig;
use super::errors::{
    binary_not_found, exit_failure, malformed_stream, spawn_failure, stalled_stream,
    transport_failure, truncated_stream,
};
use super::jsonl::JsonlFramer;
use super::process::{ChildGuard, EnvLookup, Invocation};
use super::translate::{EventTranslator, Translation};
use super::wire::ThreadEvent;
use crate::features::runs::domain::RunFailure;
use crate::features::runs::ports::{Cancellation, RunProgressSink};

/// Largest stderr tail kept for exit classification.
const MAX_STDERR_BYTES: usize = 16 * 1024;

/// Bound on collecting the stderr tail once the child has exited (a
/// descendant may still hold the pipe open).
const STDERR_COLLECT_TIMEOUT: Duration = Duration::from_millis(500);

/// Stdout read size.
const READ_CHUNK_BYTES: usize = 16 * 1024;

/// Aborts a background task when dropped.
struct AbortOnDrop(JoinHandle<Vec<u8>>);

impl Drop for AbortOnDrop {
    fn drop(&mut self) {
        self.0.abort();
    }
}

/// Runs one turn to its outcome.
pub async fn run_turn(
    invocation: &Invocation,
    env: &EnvLookup,
    prompt: &str,
    config: &CodexConfig,
    cancellation: &Cancellation,
    sink: &dyn RunProgressSink,
) -> Result<(), RunFailure> {
    let mut guard = invocation.spawn(env).map_err(|error| match error.kind() {
        std::io::ErrorKind::NotFound => binary_not_found(),
        _ => spawn_failure(),
    })?;
    let child = guard.child_mut();
    let (Some(mut stdin), Some(mut stdout), Some(stderr)) =
        (child.stdin.take(), child.stdout.take(), child.stderr.take())
    else {
        return Err(spawn_failure());
    };
    let mut stderr_tail = AbortOnDrop(tokio::spawn(read_tail(stderr, MAX_STDERR_BYTES)));
    let idle = config.idle_timeout;

    // The prompt goes to stdin, never argv. A failed write means the CLI
    // already exited; its exit status explains why, so keep going.
    let write = async {
        stdin.write_all(prompt.as_bytes()).await?;
        stdin.shutdown().await
    };
    tokio::select! {
        biased;
        () = cancellation.cancelled() => return cancel(guard, config.exit_grace).await,
        written = tokio::time::timeout(idle, write) => {
            if written.is_err() {
                return Err(stalled_stream());
            }
        }
    }
    drop(stdin);

    let mut framer = JsonlFramer::new();
    let mut translator = EventTranslator::new();
    let mut buffer = vec![0_u8; READ_CHUNK_BYTES];
    loop {
        let read = tokio::select! {
            biased;
            () = cancellation.cancelled() => return cancel(guard, config.exit_grace).await,
            read = tokio::time::timeout(idle, stdout.read(&mut buffer)) => read,
        };
        let lines = match read {
            Err(_) => return Err(stalled_stream()),
            Ok(Err(_)) => return Err(transport_failure()),
            Ok(Ok(0)) => {
                let last = framer.finish().map_err(|_| malformed_stream())?;
                if let Some(outcome) = forward_lines(
                    last.into_iter().collect(),
                    &mut translator,
                    cancellation,
                    sink,
                )? {
                    return finish(guard, outcome, config.exit_grace).await;
                }
                break;
            }
            Ok(Ok(read)) => framer
                .push(&buffer[..read])
                .map_err(|_| malformed_stream())?,
        };
        if let Some(outcome) = forward_lines(lines, &mut translator, cancellation, sink)? {
            return finish(guard, outcome, config.exit_grace).await;
        }
    }

    // Stdout closed without a turn outcome: explain it from the exit.
    let status = tokio::select! {
        biased;
        () = cancellation.cancelled() => return cancel(guard, config.exit_grace).await,
        status = tokio::time::timeout(config.exit_grace, guard.child_mut().wait()) => status,
    };
    let status = match status {
        Ok(Ok(status)) => status,
        Ok(Err(_)) | Err(_) => return Err(truncated_stream()),
    };
    if status.success() {
        return Err(truncated_stream());
    }
    let tail = match tokio::time::timeout(STDERR_COLLECT_TIMEOUT, &mut stderr_tail.0).await {
        Ok(Ok(bytes)) => String::from_utf8_lossy(&bytes).into_owned(),
        _ => String::new(),
    };
    let diagnostics = format!("{}\n{tail}", translator.last_error().unwrap_or_default());
    Err(exit_failure(status.code(), &diagnostics))
}

/// Decodes and forwards complete lines; `Some` once the turn has an outcome.
fn forward_lines(
    lines: Vec<String>,
    translator: &mut EventTranslator,
    cancellation: &Cancellation,
    sink: &dyn RunProgressSink,
) -> Result<Option<Result<(), RunFailure>>, RunFailure> {
    for line in lines {
        let event: ThreadEvent = serde_json::from_str(&line).map_err(|_| malformed_stream())?;
        if cancellation.is_cancelled() {
            return Err(RunFailure::cancelled());
        }
        match translator.apply(event) {
            Translation::Skip => {}
            Translation::Text(text) => sink.text_delta(text),
            Translation::Tool(tool_call) => sink.tool_activity(tool_call),
            Translation::Finished(outcome) => return Ok(Some(outcome)),
        }
    }
    Ok(None)
}

/// The turn has its outcome: let the CLI exit on its own, then reap the
/// group (the guard kills whatever is left).
async fn finish(
    mut guard: ChildGuard,
    outcome: Result<(), RunFailure>,
    grace: Duration,
) -> Result<(), RunFailure> {
    let _ = tokio::time::timeout(grace, guard.child_mut().wait()).await;
    outcome
}

/// Terminates the group, waits up to `grace`, then the guard drop kills it.
async fn cancel(mut guard: ChildGuard, grace: Duration) -> Result<(), RunFailure> {
    guard.terminate();
    let _ = tokio::time::timeout(grace, guard.child_mut().wait()).await;
    Err(RunFailure::cancelled())
}

/// Reads a stream to its end, keeping only the last `limit` bytes.
async fn read_tail(mut stream: impl AsyncRead + Unpin, limit: usize) -> Vec<u8> {
    let mut tail = Vec::new();
    let mut chunk = vec![0_u8; 4096];
    while let Ok(read) = stream.read(&mut chunk).await {
        if read == 0 {
            break;
        }
        tail.extend_from_slice(&chunk[..read]);
        if tail.len() > limit {
            let excess = tail.len() - limit;
            tail.drain(..excess);
        }
    }
    tail
}
