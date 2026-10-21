//! OpenCode adapter configuration (issue #27).
//!
//! Binary resolution, timeouts and the child-process environment allowlist.
//! Nothing here reads a credential: OpenCode owns its own provider secrets
//! (`opencode auth`), so the adapter forwards only the non-secret variables
//! the CLI needs to find its configuration, data directory and tools.

use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::time::Duration;

/// Provider id the catalog advertises and the run router dispatches on.
pub const OPENCODE_PROVIDER_ID: &str = "opencode";

/// Environment variable that overrides the OpenCode binary location.
pub const BINARY_ENV_VAR: &str = "NX_DESKTOP_OPENCODE_BIN";

/// Effort stop advertised for a model that exposes no OpenCode variant: it
/// runs the model with OpenCode's own default settings (no `#variant`).
pub const DEFAULT_EFFORT_STOP: &str = "default";

#[cfg(windows)]
const BINARY_NAME: &str = "opencode.exe";
#[cfg(not(windows))]
const BINARY_NAME: &str = "opencode";

/// Non-secret variables forwarded to the child. Everything else — including
/// the app's own `ANTHROPIC_API_KEY` — is cleared before spawning.
pub const FORWARDED_ENV_VARS: &[&str] = &[
    "HOME",
    "USER",
    "LOGNAME",
    "PATH",
    "SHELL",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TMPDIR",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "XDG_CACHE_HOME",
    "XDG_STATE_HOME",
    "OPENCODE_CONFIG",
    "OPENCODE_CONFIG_DIR",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "SYSTEMROOT",
    "PATHEXT",
    "TEMP",
    "TMP",
];

/// Adapter settings; production uses [`OpenCodeConfig::from_process_env`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OpenCodeConfig {
    /// Explicit binary path; `None` searches `PATH` and the install dirs.
    pub binary: Option<PathBuf>,
    /// Bound on one model discovery (spawn, read and exit).
    pub discovery_timeout: Duration,
    /// How long a successful discovery is served before it is refreshed.
    pub catalog_ttl: Duration,
    /// How long a failed discovery is served before it is retried.
    pub retry_after_failure: Duration,
    /// Bound between two run stream lines. OpenCode emits a text part only
    /// when the block ends and a tool part only when the tool finishes, so a
    /// long tool call is silent; this is deliberately generous.
    pub idle_timeout: Duration,
    /// Bound on the process exit after its stream ended.
    pub exit_timeout: Duration,
    /// Time a cancelled run gets to interrupt its session before the whole
    /// process group is killed.
    pub cancel_grace: Duration,
}

impl Default for OpenCodeConfig {
    fn default() -> Self {
        Self {
            binary: None,
            discovery_timeout: Duration::from_secs(30),
            catalog_ttl: Duration::from_secs(10 * 60),
            retry_after_failure: Duration::from_secs(30),
            idle_timeout: Duration::from_secs(30 * 60),
            exit_timeout: Duration::from_secs(10),
            cancel_grace: Duration::from_secs(3),
        }
    }
}

impl OpenCodeConfig {
    /// Defaults plus the optional [`BINARY_ENV_VAR`] override.
    pub fn from_process_env() -> Self {
        Self {
            binary: std::env::var_os(BINARY_ENV_VAR)
                .filter(|value| !value.is_empty())
                .map(PathBuf::from),
            ..Self::default()
        }
    }

    /// Locates the binary now (so an install after app start is picked up).
    pub fn resolve_binary(&self) -> Option<PathBuf> {
        resolve_binary(
            self.binary.as_deref(),
            std::env::var_os("PATH").as_deref(),
            home_dir().as_deref(),
        )
    }
}

/// Resolution order: the explicit path (must be an absolute executable
/// file), every `PATH` entry, then the official installer directory
/// (`~/.opencode/bin`) and the common package-manager prefixes — a GUI app
/// launched from the dock does not inherit the login shell's `PATH`.
pub fn resolve_binary(
    explicit: Option<&Path>,
    path_var: Option<&OsStr>,
    home: Option<&Path>,
) -> Option<PathBuf> {
    if let Some(explicit) = explicit {
        return (explicit.is_absolute() && is_executable_file(explicit))
            .then(|| explicit.to_path_buf());
    }
    let mut candidates: Vec<PathBuf> = path_var
        .map(|paths| {
            std::env::split_paths(paths)
                .filter(|dir| dir.is_absolute())
                .map(|dir| dir.join(BINARY_NAME))
                .collect()
        })
        .unwrap_or_default();
    if let Some(home) = home {
        candidates.push(home.join(".opencode").join("bin").join(BINARY_NAME));
    }
    #[cfg(not(windows))]
    {
        candidates.push(PathBuf::from("/opt/homebrew/bin").join(BINARY_NAME));
        candidates.push(PathBuf::from("/usr/local/bin").join(BINARY_NAME));
    }
    candidates
        .into_iter()
        .find(|candidate| is_executable_file(candidate))
}

/// The forwarded subset of the current process environment.
pub fn forwarded_env() -> Vec<(OsString, OsString)> {
    FORWARDED_ENV_VARS
        .iter()
        .filter_map(|name| std::env::var_os(name).map(|value| (OsString::from(name), value)))
        .collect()
}

fn home_dir() -> Option<PathBuf> {
    let var = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
    std::env::var_os(var)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

fn is_executable_file(path: &Path) -> bool {
    let Ok(metadata) = std::fs::metadata(path) else {
        return false;
    };
    if !metadata.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use crate::features::providers::adapters::opencode::test_support::TempDir;

    fn executable(dir: &Path, name: &str) -> PathBuf {
        let path = dir.join(name);
        std::fs::write(&path, "#!/bin/sh\n").expect("write binary");
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).expect("chmod");
        path
    }

    #[test]
    fn an_explicit_path_wins_and_must_be_an_absolute_executable() {
        let dir = TempDir::new("resolve-explicit");
        let binary = executable(dir.path(), "custom-opencode");
        assert_eq!(
            resolve_binary(Some(&binary), None, None),
            Some(binary.clone())
        );
        assert_eq!(
            resolve_binary(Some(Path::new("relative/opencode")), None, None),
            None
        );
        let not_executable = dir.path().join("plain");
        std::fs::write(&not_executable, "x").expect("write");
        assert_eq!(resolve_binary(Some(&not_executable), None, None), None);
    }

    #[test]
    fn searches_path_then_the_installer_directory() {
        let on_path = TempDir::new("resolve-path");
        let home = TempDir::new("resolve-home");
        let install_dir = home.path().join(".opencode").join("bin");
        std::fs::create_dir_all(&install_dir).expect("install dir");
        let installed = executable(&install_dir, "opencode");

        let path_var = std::env::join_paths([on_path.path()]).expect("path var");
        assert_eq!(
            resolve_binary(None, Some(&path_var), Some(home.path())),
            Some(installed.clone()),
            "falls back to ~/.opencode/bin when PATH has no binary"
        );

        let first = executable(on_path.path(), "opencode");
        assert_eq!(
            resolve_binary(None, Some(&path_var), Some(home.path())),
            Some(first),
            "a PATH entry wins over the installer directory"
        );
    }

    #[test]
    fn the_forwarded_environment_never_carries_provider_secrets() {
        for secret in ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENCODE_PASSWORD"] {
            assert!(!FORWARDED_ENV_VARS.contains(&secret), "{secret}");
        }
    }
}
