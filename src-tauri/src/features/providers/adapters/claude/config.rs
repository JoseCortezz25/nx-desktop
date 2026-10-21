//! Claude provider configuration (issue #25).
//!
//! The model table lives here, in Rust provider configuration, and reaches
//! the UI only through `list_providers` / `list_models`. Model ids are the
//! exact API ids (no date suffix); the first entry is the default model.
//!
//! Effort mapping (research #31, `docs/research-tecnico/effort-levels-by-provider.md`
//! §2 and §8): the app keeps the provider-native token as the wire value, so
//! each advertised stop maps 1:1 onto `output_config.effort`. All three 5.5
//! models accept the full `low → medium → high → xhigh → max` ladder. Any
//! other token — including a stop that is valid for another provider, such as
//! OpenCode's `standard` — is rejected instead of being guessed onto the
//! nearest Claude level.

use std::time::Duration;

use super::wire::WireEffort;

/// Provider id the catalog advertises and the run router dispatches on.
pub const CLAUDE_PROVIDER_ID: &str = "claude";

/// Production Messages API origin.
pub const DEFAULT_BASE_URL: &str = "https://api.anthropic.com";

/// Output budget for one streamed response.
pub const DEFAULT_MAX_TOKENS: u32 = 64_000;

/// Every effort stop the 5.5 models expose, in ascending order.
pub const FULL_EFFORT_LADDER: &[&str] = &["low", "medium", "high", "xhigh", "max"];

/// One configured Claude model.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ClaudeModelConfig {
    pub id: &'static str,
    pub display_name: &'static str,
    pub effort_levels: &'static [&'static str],
}

/// The Claude model table; the first row is the default model.
pub const CLAUDE_MODELS: &[ClaudeModelConfig] = &[
    ClaudeModelConfig {
        id: "claude-opus-5-5",
        display_name: "Claude Opus 5.5",
        effort_levels: FULL_EFFORT_LADDER,
    },
    ClaudeModelConfig {
        id: "claude-sonnet-5-5",
        display_name: "Claude Sonnet 5.5",
        effort_levels: FULL_EFFORT_LADDER,
    },
    ClaudeModelConfig {
        id: "claude-haiku-5-5",
        display_name: "Claude Haiku 5.5",
        effort_levels: FULL_EFFORT_LADDER,
    },
];

/// Adapter settings. The base URL is configurable so tests can target a
/// local mock server; production uses [`ClaudeConfig::default`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClaudeConfig {
    pub base_url: String,
    pub max_tokens: u32,
    /// Bound on establishing the TCP/TLS connection.
    pub connect_timeout: Duration,
    /// Bound on waiting for the response head and between stream chunks;
    /// the server pings well inside this window on a healthy stream.
    pub idle_timeout: Duration,
    pub models: &'static [ClaudeModelConfig],
}

impl Default for ClaudeConfig {
    fn default() -> Self {
        Self {
            base_url: DEFAULT_BASE_URL.to_owned(),
            max_tokens: DEFAULT_MAX_TOKENS,
            connect_timeout: Duration::from_secs(30),
            idle_timeout: Duration::from_secs(300),
            models: CLAUDE_MODELS,
        }
    }
}

impl ClaudeConfig {
    /// The `POST` endpoint for message creation.
    pub fn messages_url(&self) -> String {
        format!("{}/v1/messages", self.base_url.trim_end_matches('/'))
    }

    /// The configured model with this exact id.
    pub fn find_model(&self, model_id: &str) -> Option<&ClaudeModelConfig> {
        self.models.iter().find(|model| model.id == model_id)
    }
}

/// Maps an app effort stop onto the vendor value, only when `model`
/// advertises it.
pub fn wire_effort(model: &ClaudeModelConfig, effort_level: &str) -> Option<WireEffort> {
    if !model.effort_levels.contains(&effort_level) {
        return None;
    }
    match effort_level {
        "low" => Some(WireEffort::Low),
        "medium" => Some(WireEffort::Medium),
        "high" => Some(WireEffort::High),
        "xhigh" => Some(WireEffort::Xhigh),
        "max" => Some(WireEffort::Max),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_default_model_is_opus() {
        assert_eq!(CLAUDE_MODELS[0].id, "claude-opus-5-5");
        let ids: Vec<&str> = CLAUDE_MODELS.iter().map(|model| model.id).collect();
        assert_eq!(
            ids,
            vec!["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]
        );
    }

    #[test]
    fn every_advertised_stop_maps_one_to_one() {
        let model = CLAUDE_MODELS[0];
        let mapped: Vec<Option<WireEffort>> = FULL_EFFORT_LADDER
            .iter()
            .map(|level| wire_effort(&model, level))
            .collect();
        assert_eq!(
            mapped,
            vec![
                Some(WireEffort::Low),
                Some(WireEffort::Medium),
                Some(WireEffort::High),
                Some(WireEffort::Xhigh),
                Some(WireEffort::Max),
            ]
        );
    }

    #[test]
    fn foreign_or_unadvertised_stops_are_rejected() {
        let model = CLAUDE_MODELS[0];
        assert_eq!(wire_effort(&model, "standard"), None);
        assert_eq!(wire_effort(&model, "HIGH"), None);
        let narrow = ClaudeModelConfig {
            id: "narrow",
            display_name: "Narrow",
            effort_levels: &["low", "high"],
        };
        assert_eq!(wire_effort(&narrow, "max"), None);
        assert_eq!(wire_effort(&narrow, "high"), Some(WireEffort::High));
    }

    #[test]
    fn messages_url_tolerates_a_trailing_slash() {
        let config = ClaudeConfig {
            base_url: "http://127.0.0.1:9/".to_owned(),
            ..ClaudeConfig::default()
        };
        assert_eq!(config.messages_url(), "http://127.0.0.1:9/v1/messages");
        assert_eq!(
            ClaudeConfig::default().messages_url(),
            "https://api.anthropic.com/v1/messages"
        );
    }
}
