//! Codex provider configuration (issue #26).
//!
//! The model table lives here, in Rust provider configuration, and reaches
//! the UI only through `list_providers` / `list_models`. The Codex CLI has no
//! documented non-interactive model-listing command, so the table carries the
//! model ids the Codex models page documents for `codex -m` (evidence in
//! `odd/tasks/issue-26-codex-provider.md`). The first entry is the default.
//!
//! Effort mapping (research #31, `docs/research-tecnico/effort-levels-by-provider.md`
//! §3 and §8): the adapter drives the Codex CLI's `model_reasoning_effort`
//! with the provider-native token, 1:1. `ultra` is Codex-CLI vocabulary and is
//! only advertised where the Codex docs place it (GPT-6.1 Sol). The `none`
//! stop is a reasoning on/off toggle, not an effort level (§6 item 4), so it
//! is not advertised. Any token a model does not advertise — including a stop
//! valid for another provider, such as OpenCode's `standard` — is rejected
//! instead of being guessed onto the nearest Codex level.

use std::path::PathBuf;
use std::time::Duration;

/// Provider id the catalog advertises and the run router dispatches on.
pub const CODEX_PROVIDER_ID: &str = "codex";

/// Optional absolute path to the `codex` executable, read from the Rust
/// process environment (never from `VITE_*`). Without it the binary is
/// resolved from `PATH` plus the usual install directories.
pub const CODEX_BINARY_VAR: &str = "NX_CODEX_BIN";

/// One configured Codex model.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CodexModelConfig {
    pub id: &'static str,
    pub display_name: &'static str,
    pub effort_levels: &'static [&'static str],
}

/// The Codex model table; the first row is the default model.
pub const CODEX_MODELS: &[CodexModelConfig] = &[
    CodexModelConfig {
        id: "gpt-6.1-sol",
        display_name: "GPT-6.1 Sol",
        effort_levels: &["low", "medium", "high", "xhigh", "max", "ultra"],
    },
    CodexModelConfig {
        id: "gpt-6-astra",
        display_name: "GPT-6 Astra",
        effort_levels: &["low", "medium", "xhigh"],
    },
    CodexModelConfig {
        id: "gpt-6-sol",
        display_name: "GPT-6 Sol",
        effort_levels: &["low", "medium", "high", "xhigh", "max"],
    },
    CodexModelConfig {
        id: "gpt-6-luna",
        display_name: "GPT-6 Luna",
        effort_levels: &["low", "medium", "high", "xhigh", "max"],
    },
];

/// Adapter settings. Production uses [`CodexConfig::from_process_env`];
/// tests point `binary` at a fake executable.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CodexConfig {
    /// Explicit executable; `None` resolves `codex` at run time.
    pub binary: Option<PathBuf>,
    /// Bound on the silence between two JSONL events. A healthy turn can run
    /// a long command without emitting anything, so this is generous.
    pub idle_timeout: Duration,
    /// How long a terminated or finished CLI gets to exit before its
    /// process group is killed.
    pub exit_grace: Duration,
    pub models: &'static [CodexModelConfig],
}

impl Default for CodexConfig {
    fn default() -> Self {
        Self {
            binary: None,
            idle_timeout: Duration::from_secs(20 * 60),
            exit_grace: Duration::from_secs(3),
            models: CODEX_MODELS,
        }
    }
}

impl CodexConfig {
    /// Defaults plus the optional [`CODEX_BINARY_VAR`] override.
    pub fn from_process_env() -> Self {
        Self::with_binary_override(std::env::var_os(CODEX_BINARY_VAR).map(PathBuf::from))
    }

    /// Defaults with an explicit (possibly absent) binary override.
    pub fn with_binary_override(binary: Option<PathBuf>) -> Self {
        Self {
            binary: binary.filter(|path| !path.as_os_str().is_empty()),
            ..Self::default()
        }
    }

    /// The configured model with this exact id.
    pub fn find_model(&self, model_id: &str) -> Option<&CodexModelConfig> {
        self.models.iter().find(|model| model.id == model_id)
    }
}

/// The `model_reasoning_effort` value for an app effort stop, only when
/// `model` advertises it.
pub fn wire_effort(model: &CodexModelConfig, effort_level: &str) -> Option<&'static str> {
    model
        .effort_levels
        .iter()
        .find(|level| **level == effort_level)
        .copied()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_default_model_is_listed_first() {
        let ids: Vec<&str> = CODEX_MODELS.iter().map(|model| model.id).collect();
        assert_eq!(
            ids,
            vec!["gpt-6.1-sol", "gpt-6-astra", "gpt-6-sol", "gpt-6-luna"]
        );
    }

    #[test]
    fn every_advertised_stop_maps_one_to_one() {
        for model in CODEX_MODELS {
            for level in model.effort_levels {
                assert_eq!(wire_effort(model, level), Some(*level), "{}", model.id);
            }
        }
    }

    #[test]
    fn foreign_or_unadvertised_stops_are_rejected() {
        let sol = CODEX_MODELS[0];
        assert_eq!(wire_effort(&sol, "standard"), None);
        assert_eq!(wire_effort(&sol, "none"), None);
        assert_eq!(wire_effort(&sol, "HIGH"), None);
        let astra = CODEX_MODELS[1];
        assert_eq!(wire_effort(&astra, "high"), None);
        assert_eq!(wire_effort(&astra, "ultra"), None);
        assert_eq!(wire_effort(&astra, "xhigh"), Some("xhigh"));
    }

    #[test]
    fn ultra_is_only_offered_where_codex_documents_it() {
        let with_ultra: Vec<&str> = CODEX_MODELS
            .iter()
            .filter(|model| model.effort_levels.contains(&"ultra"))
            .map(|model| model.id)
            .collect();
        assert_eq!(with_ultra, vec!["gpt-6.1-sol"]);
    }

    #[test]
    fn a_blank_binary_override_is_ignored() {
        assert_eq!(
            CodexConfig::with_binary_override(Some(PathBuf::new())).binary,
            None
        );
        assert_eq!(
            CodexConfig::with_binary_override(Some(PathBuf::from("/opt/codex"))).binary,
            Some(PathBuf::from("/opt/codex"))
        );
    }
}
