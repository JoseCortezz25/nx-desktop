//! Supervised OpenCode child process (issue #27).
//!
//! Every OpenCode invocation goes through [`SupervisedChild`]:
//!
//! - explicit binary and argument array, never a shell;
//! - a cleared environment plus the non-secret allowlist from `config.rs`,
//!   with `PWD` pinned to the authorized working directory (OpenCode resolves
//!   its project directory from `PWD` before `cwd`);
//! - stdout piped and read line by line with a size bound; stderr discarded,
//!   so vendor diagnostics never reach a failure, an event or a log;
//! - on Unix the child leads its own process group. `opencode --standalone`
//!   spawns a private `opencode serve` grandchild, and cancellation, timeouts
//!   and drop signal the whole group so nothing outlives the run.
//!
//! Signals are only sent while the leader is still unreaped, so the group id
//! cannot have been recycled by an unrelated process.

use std::ffi::OsString;
use std::io;
use std::path::Path;
use std::process::{ExitStatus, Stdio};
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdout, Command};

use super::config::forwarded_env;

/// Largest stream line decoded; longer lines (a huge tool output) are skipped.
pub const MAX_LINE_BYTES: usize = 16 * 1024 * 1024;

/// One running OpenCode process.
pub struct SupervisedChild {
    child: Child,
    pid: Option<u32>,
    reaped: bool,
}

impl SupervisedChild {
    /// Spawns `binary args...` in `cwd`. `stdin` is piped when the caller
    /// will write a payload, otherwise it is closed.
    pub fn spawn(binary: &Path, args: &[OsString], cwd: &Path, stdin: bool) -> io::Result<Self> {
        let mut command = Command::new(binary);
        command
            .args(args)
            .current_dir(cwd)
            .env_clear()
            .envs(forwarded_env())
            .env("PWD", cwd)
            .env("NO_COLOR", "1")
            .stdin(if stdin { Stdio::piped() } else { Stdio::null() })
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        #[cfg(unix)]
        command.process_group(0);
        let child = command.spawn()?;
        let pid = child.id();
        Ok(Self {
            child,
            pid,
            reaped: false,
        })
    }

    /// Writes `payload` to stdin and closes it (OpenCode reads the prompt
    /// from a non-TTY stdin until EOF).
    pub async fn write_stdin(&mut self, payload: &[u8]) -> io::Result<()> {
        let Some(mut stdin) = self.child.stdin.take() else {
            return Ok(());
        };
        stdin.write_all(payload).await?;
        stdin.shutdown().await
    }

    pub fn take_stdout(&mut self) -> Option<ChildStdout> {
        self.child.stdout.take()
    }

    /// Waits for the exit after the stream ended; kills the group when the
    /// process does not exit within `timeout`.
    pub async fn wait_or_kill(&mut self, timeout: Duration) -> Option<ExitStatus> {
        match tokio::time::timeout(timeout, self.child.wait()).await {
            Ok(status) => {
                self.reaped = true;
                status.ok()
            }
            Err(_) => {
                self.kill_group();
                self.reap().await;
                None
            }
        }
    }

    /// Cancellation: interrupt the leader (OpenCode's SIGINT handler aborts
    /// the session and shuts its private server down), then kill the whole
    /// group if it is still alive after `grace`.
    pub async fn interrupt_then_kill(&mut self, grace: Duration) {
        self.interrupt();
        if tokio::time::timeout(grace, self.child.wait()).await.is_ok() {
            // The leader exited within the grace period; its own shutdown
            // stops the private server (SIGTERM, then SIGKILL after 3 s).
            // It is reaped now, so the group is no longer signalled.
            self.reaped = true;
            return;
        }
        self.kill_group();
        self.reap().await;
    }

    /// Kills the group immediately (timeouts and failures).
    pub async fn kill(&mut self) {
        self.kill_group();
        self.reap().await;
    }

    async fn reap(&mut self) {
        if !self.reaped {
            let _ = self.child.wait().await;
            self.reaped = true;
        }
    }

    fn interrupt(&mut self) {
        #[cfg(unix)]
        if let Some(pid) = self.signal_target() {
            // SAFETY: `kill` has no memory-safety preconditions; the pid is
            // our unreaped child, so it cannot name another process.
            unsafe {
                libc::kill(pid, libc::SIGINT);
            }
            return;
        }
        let _ = self.child.start_kill();
    }

    fn kill_group(&mut self) {
        #[cfg(unix)]
        if let Some(pid) = self.signal_target() {
            // SAFETY: as above; the group id is the unreaped leader's pid.
            unsafe {
                libc::killpg(pid, libc::SIGKILL);
            }
        }
        let _ = self.child.start_kill();
    }

    #[cfg(unix)]
    fn signal_target(&self) -> Option<i32> {
        if self.reaped {
            return None;
        }
        self.pid.and_then(|pid| i32::try_from(pid).ok())
    }
}

impl Drop for SupervisedChild {
    fn drop(&mut self) {
        // A dropped run future (or an early return) must not leave the
        // private server behind; `kill_on_drop` alone only reaches the leader.
        if !self.reaped {
            self.kill_group();
        }
    }
}

/// Bounded, cancel-safe line reader over the child's stdout.
pub struct LineReader<R> {
    inner: BufReader<R>,
    line: Vec<u8>,
    max: usize,
    overflowed: bool,
}

impl<R: AsyncRead + Unpin> LineReader<R> {
    pub fn new(inner: R, max: usize) -> Self {
        Self {
            inner: BufReader::new(inner),
            line: Vec::new(),
            max,
            overflowed: false,
        }
    }

    /// The next complete line (without its terminator), or `None` at EOF.
    /// Lines longer than the bound are dropped whole. State only changes
    /// after `fill_buf` resolves, so dropping this future loses nothing.
    pub async fn next_line(&mut self) -> io::Result<Option<String>> {
        loop {
            let available = self.inner.fill_buf().await?;
            if available.is_empty() {
                let overflowed = std::mem::take(&mut self.overflowed);
                if self.line.is_empty() || overflowed {
                    self.line.clear();
                    return Ok(None);
                }
                return Ok(Some(self.take_line()));
            }
            let newline = available.iter().position(|byte| *byte == b'\n');
            let chunk_len = newline.unwrap_or(available.len());
            if !self.overflowed {
                if self.line.len() + chunk_len > self.max {
                    self.overflowed = true;
                    self.line.clear();
                } else {
                    self.line.extend_from_slice(&available[..chunk_len]);
                }
            }
            match newline {
                Some(index) => {
                    self.inner.consume(index + 1);
                    if std::mem::take(&mut self.overflowed) {
                        self.line.clear();
                        continue;
                    }
                    return Ok(Some(self.take_line()));
                }
                None => {
                    let consumed = available.len();
                    self.inner.consume(consumed);
                }
            }
        }
    }

    fn take_line(&mut self) -> String {
        let bytes = std::mem::take(&mut self.line);
        let text = String::from_utf8_lossy(&bytes);
        text.strip_suffix('\r').unwrap_or(&text).to_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn lines(input: &[u8], max: usize) -> Vec<String> {
        let mut reader = LineReader::new(input, max);
        let mut out = Vec::new();
        while let Some(line) = reader.next_line().await.expect("in-memory read") {
            out.push(line);
        }
        out
    }

    #[tokio::test]
    async fn splits_lines_and_keeps_a_final_unterminated_one() {
        assert_eq!(
            lines(b"one\r\ntwo\n\nthree", 64).await,
            vec!["one", "two", "", "three"]
        );
        assert!(lines(b"", 64).await.is_empty());
    }

    #[tokio::test]
    async fn drops_overlong_lines_whole() {
        assert_eq!(
            lines(b"short\nthis-line-is-too-long\nok\nlast-too-long-too", 8).await,
            vec!["short", "ok"]
        );
    }

    #[tokio::test]
    async fn invalid_utf8_is_replaced_not_fatal() {
        assert_eq!(lines(b"a\xffb\n", 64).await, vec!["a\u{fffd}b"]);
    }
}
