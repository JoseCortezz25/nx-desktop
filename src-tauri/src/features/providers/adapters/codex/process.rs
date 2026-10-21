//! Codex CLI process boundary (issue #26).
//!
//! Spawn rules (`security-and-capabilities.md` §4):
//!
//! - **Explicit binary identity.** The executable is an absolute path: the
//!   `NX_CODEX_BIN` override, or `codex` resolved from `PATH` plus the usual
//!   install directories (a GUI app launched from the Finder inherits a
//!   minimal `PATH`). No shell is ever involved.
//! - **Argument array.** Fixed flags plus catalog-validated model and effort
//!   tokens. The prompt never appears in `argv` (it is not visible in `ps`
//!   and cannot be parsed as a flag): it is written to stdin and the
//!   positional argument is `-`.
//! - **Authorized `cwd`.** The canonical project workspace root, passed both
//!   as the process `cwd` and as `--cd`.
//! - **Minimal environment.** The environment is cleared and only an
//!   allowlist of non-secret variables the CLI needs (home, locale, temp,
//!   proxy, `CODEX_HOME`) is forwarded. `OPENAI_API_KEY`, `CODEX_API_KEY`,
//!   `ANTHROPIC_API_KEY` and everything else are never passed: Codex
//!   authenticates with its own login (`codex login`), which the app neither
//!   reads nor forwards.
//! - **Supervised lifetime.** The child leads its own process group (Unix),
//!   so cancellation can signal the CLI *and* the commands it spawned.
//!   [`ChildGuard`] kills the group when dropped, on every exit path.

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::Stdio;

use tokio::process::{Child, Command};

use super::errors::{binary_not_found, configured_binary_invalid};
use crate::features::runs::domain::RunFailure;

/// Reads a variable by name; injectable so tests never mutate the process
/// environment (`std::env::set_var` is `unsafe` in Rust 2024).
pub type EnvLookup = Box<dyn Fn(&str) -> Option<OsString> + Send + Sync>;

/// Variables forwarded to the child when set. None of them is a credential.
pub const FORWARDED_ENV: &[&str] = &[
    "HOME",
    "USER",
    "LOGNAME",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TMPDIR",
    "TZ",
    "CODEX_HOME",
    "XDG_CONFIG_HOME",
    "XDG_CACHE_HOME",
    "HTTPS_PROXY",
    "HTTP_PROXY",
    "NO_PROXY",
    "https_proxy",
    "http_proxy",
    "no_proxy",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    // Windows essentials.
    "SYSTEMROOT",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "TEMP",
    "TMP",
    "PATHEXT",
];

#[cfg(windows)]
const BINARY_NAME: &str = "codex.exe";
#[cfg(not(windows))]
const BINARY_NAME: &str = "codex";

/// Install directories checked after `PATH` (relative ones under `HOME`).
#[cfg(not(windows))]
const FALLBACK_DIRS: &[&str] = &["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"];
#[cfg(not(windows))]
const HOME_FALLBACK_DIRS: &[&str] = &[".local/bin", ".npm-global/bin", ".volta/bin", ".bun/bin"];
#[cfg(windows)]
const FALLBACK_DIRS: &[&str] = &[];
#[cfg(windows)]
const HOME_FALLBACK_DIRS: &[&str] = &[];

/// Resolves the executable to spawn, as an absolute path.
pub fn resolve_binary(configured: Option<&Path>, env: &EnvLookup) -> Result<PathBuf, RunFailure> {
    let mut fallbacks: Vec<PathBuf> = FALLBACK_DIRS.iter().map(PathBuf::from).collect();
    if let Some(home) = env("HOME") {
        let home = PathBuf::from(home);
        fallbacks.extend(HOME_FALLBACK_DIRS.iter().map(|dir| home.join(dir)));
    }
    resolve_with_fallbacks(configured, env, fallbacks)
}

/// [`resolve_binary`] with explicit fallback directories (tests pass none).
pub fn resolve_with_fallbacks(
    configured: Option<&Path>,
    env: &EnvLookup,
    fallbacks: Vec<PathBuf>,
) -> Result<PathBuf, RunFailure> {
    if let Some(path) = configured {
        return if path.is_absolute() && is_executable(path) {
            Ok(path.to_owned())
        } else {
            Err(configured_binary_invalid())
        };
    }
    let mut candidates: Vec<PathBuf> = env("PATH")
        .map(|path| std::env::split_paths(&path).collect())
        .unwrap_or_default();
    candidates.extend(fallbacks);
    candidates
        .into_iter()
        .filter(|dir| dir.is_absolute())
        .map(|dir| dir.join(BINARY_NAME))
        .find(|candidate| is_executable(candidate))
        .ok_or_else(binary_not_found)
}

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    std::fs::metadata(path)
        .map(|metadata| metadata.is_file() && metadata.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(path: &Path) -> bool {
    path.is_file()
}

/// Everything one `codex exec` invocation needs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Invocation {
    pub binary: PathBuf,
    pub cwd: PathBuf,
    pub model: &'static str,
    pub effort: &'static str,
}

impl Invocation {
    /// The exact argument array (no shell, no prompt).
    pub fn args(&self) -> Vec<OsString> {
        let mut args: Vec<OsString> = [
            "exec",
            "--json",
            "--color",
            "never",
            // No approval bridge exists yet, so runs are read-only and never
            // block on an interactive approval (see the issue #26 log).
            "--sandbox",
            "read-only",
            "-c",
            "approval_policy=\"never\"",
            "--skip-git-repo-check",
            "--ephemeral",
            "--model",
            self.model,
            "-c",
        ]
        .iter()
        .map(OsString::from)
        .collect();
        args.push(OsString::from(format!(
            "model_reasoning_effort=\"{}\"",
            self.effort
        )));
        args.push(OsString::from("--cd"));
        args.push(self.cwd.clone().into_os_string());
        // Read the prompt from stdin.
        args.push(OsString::from("-"));
        args
    }

    /// The child environment: the allowlist, plus a `PATH` led by the
    /// binary's own directory (npm installs are a `node` shim beside it).
    pub fn environment(&self, env: &EnvLookup) -> Vec<(OsString, OsString)> {
        let mut vars: Vec<(OsString, OsString)> = FORWARDED_ENV
            .iter()
            .filter_map(|name| env(name).map(|value| (OsString::from(name), value)))
            .collect();
        let mut path_dirs: Vec<PathBuf> = self
            .binary
            .parent()
            .map(Path::to_path_buf)
            .into_iter()
            .collect();
        if let Some(path) = env("PATH") {
            path_dirs.extend(std::env::split_paths(&path));
        }
        if let Ok(path) = std::env::join_paths(path_dirs) {
            vars.push((OsString::from("PATH"), path));
        }
        vars
    }

    /// Spawns the CLI with piped stdio inside its own process group.
    pub fn spawn(&self, env: &EnvLookup) -> std::io::Result<ChildGuard> {
        let mut command = Command::new(&self.binary);
        command
            .args(self.args())
            .current_dir(&self.cwd)
            .env_clear()
            .envs(self.environment(env))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        #[cfg(unix)]
        command.process_group(0);
        let child = command.spawn()?;
        Ok(ChildGuard::new(child))
    }
}

/// Owns the child and kills its whole process group when dropped.
pub struct ChildGuard {
    child: Child,
    #[cfg(unix)]
    group: Option<libc::pid_t>,
}

impl ChildGuard {
    fn new(child: Child) -> Self {
        Self {
            #[cfg(unix)]
            group: child.id().and_then(|pid| libc::pid_t::try_from(pid).ok()),
            child,
        }
    }

    pub fn child_mut(&mut self) -> &mut Child {
        &mut self.child
    }

    /// Asks the CLI and its descendants to stop (`SIGTERM` to the group).
    pub fn terminate(&mut self) {
        #[cfg(unix)]
        if let Some(group) = self.group {
            signal_group(group, libc::SIGTERM);
            return;
        }
        let _ = self.child.start_kill();
    }
}

impl Drop for ChildGuard {
    fn drop(&mut self) {
        #[cfg(unix)]
        if let Some(group) = self.group {
            signal_group(group, libc::SIGKILL);
        }
        // `kill_on_drop` also covers the leader itself.
        let _ = self.child.start_kill();
    }
}

#[cfg(unix)]
fn signal_group(group: libc::pid_t, signal: libc::c_int) {
    if group <= 0 {
        return;
    }
    // SAFETY: `killpg` only sends a signal; it takes plain integers and
    // touches no memory owned by this process. `group` is the pid of a child
    // spawned with `process_group(0)`, so it names that child's own group,
    // never this process's group (and never 0 / -1, rejected above). An
    // already-empty group yields `ESRCH`, which is ignored.
    unsafe {
        libc::killpg(group, signal);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lookup(pairs: &'static [(&'static str, &'static str)]) -> EnvLookup {
        Box::new(move |name| {
            pairs
                .iter()
                .find(|(key, _)| *key == name)
                .map(|(_, value)| OsString::from(value))
        })
    }

    fn invocation() -> Invocation {
        Invocation {
            binary: PathBuf::from("/opt/tools/codex"),
            cwd: PathBuf::from("/workspace/app"),
            model: "gpt-6-sol",
            effort: "high",
        }
    }

    #[test]
    fn builds_the_documented_argument_array() {
        let args: Vec<String> = invocation()
            .args()
            .into_iter()
            .map(|arg| arg.to_string_lossy().into_owned())
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
                "gpt-6-sol",
                "-c",
                "model_reasoning_effort=\"high\"",
                "--cd",
                "/workspace/app",
                "-",
            ]
        );
    }

    #[test]
    fn forwards_only_allowlisted_variables() {
        let env = lookup(&[
            ("HOME", "/home/dev"),
            ("PATH", "/usr/bin"),
            ("OPENAI_API_KEY", "sk-openai-secret"),
            ("CODEX_API_KEY", "sk-codex-secret"),
            ("ANTHROPIC_API_KEY", "sk-ant-secret"),
        ]);
        let vars = invocation().environment(&env);
        let names: Vec<String> = vars
            .iter()
            .map(|(name, _)| name.to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec!["HOME", "PATH"]);
        let path = vars
            .iter()
            .find(|(name, _)| name == "PATH")
            .map(|(_, value)| value.to_string_lossy().into_owned());
        assert_eq!(path.as_deref(), Some("/opt/tools:/usr/bin"));
        assert!(
            vars.iter()
                .all(|(_, value)| !value.to_string_lossy().contains("secret"))
        );
    }

    #[test]
    fn a_missing_binary_is_reported_with_the_fixed_message() {
        let env = lookup(&[
            ("PATH", "/definitely/missing/bin"),
            ("HOME", "/definitely/missing"),
        ]);
        let failure = resolve_with_fallbacks(None, &env, Vec::new()).expect_err("nothing on PATH");
        assert!(failure.message.contains("Codex CLI was not found"));
        let relative = resolve_binary(Some(Path::new("codex")), &env).expect_err("relative");
        assert!(relative.message.contains("NX_CODEX_BIN"));
        let missing = resolve_binary(Some(Path::new("/definitely/missing/codex")), &env)
            .expect_err("missing");
        assert!(missing.message.contains("NX_CODEX_BIN"));
    }
}
