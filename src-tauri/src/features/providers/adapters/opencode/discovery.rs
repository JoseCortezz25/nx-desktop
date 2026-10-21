//! OpenCode model discovery (issue #27).
//!
//! Models come from OpenCode itself, never from a fixed list: the adapter
//! runs `opencode api --standalone model.list`, the same server operation
//! `opencode models` prints, but as JSON that also carries each model's
//! `#variant` ids. The child is bounded by a timeout and an output cap, runs
//! in the OS temp directory (no project is opened) and its output is decoded
//! into ids, names and variant ids only.
//!
//! Mapping into the app's catalog:
//!
//! - model id = OpenCode's `providerID/modelID` (the exact `--model` value),
//!   so every upstream provider OpenCode is configured for is offered under
//!   the single app provider `opencode` (research #31, gap G7);
//! - display name = OpenCode's `name` plus the upstream provider id, since
//!   the same model often appears under several upstream providers;
//! - effort stops = the model's variant ids in OpenCode's order. A model with
//!   no variant advertises the single stop [`DEFAULT_EFFORT_STOP`], which
//!   runs it without a `#variant` suffix.
//!
//! Rows that are disabled, oversized or that would not round-trip through
//! OpenCode's `provider/model#variant` parser are dropped.

use std::ffi::OsString;

use tokio::io::AsyncReadExt;

use super::config::{DEFAULT_EFFORT_STOP, OpenCodeConfig};
use super::process::SupervisedChild;
use super::wire::{ModelListEnvelope, WireModel};
use crate::features::providers::domain::MAX_ID_LEN;

/// Largest `model.list` response accepted.
pub const MAX_MODEL_LIST_BYTES: usize = 8 * 1024 * 1024;

/// Largest display name kept.
const MAX_DISPLAY_NAME_CHARS: usize = 128;

/// One discovered OpenCode model.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OpenCodeModel {
    /// `providerID/modelID`.
    pub id: String,
    pub display_name: String,
    /// Variant ids in OpenCode's order; empty when the model has none.
    pub variants: Vec<String>,
}

impl OpenCodeModel {
    /// The effort stops this model advertises.
    pub fn effort_stops(&self) -> Vec<String> {
        if self.variants.is_empty() {
            vec![DEFAULT_EFFORT_STOP.to_owned()]
        } else {
            self.variants.clone()
        }
    }

    /// The `--model` value for `effort`, or `None` when the model does not
    /// advertise that stop.
    pub fn wire_model(&self, effort: &str) -> Option<String> {
        if self.variants.iter().any(|variant| variant == effort) {
            return Some(format!("{}#{effort}", self.id));
        }
        (self.variants.is_empty() && effort == DEFAULT_EFFORT_STOP).then(|| self.id.clone())
    }
}

/// Why discovery produced no catalog.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiscoveryError {
    BinaryNotFound,
    Spawn,
    Timeout,
    Exit,
    TooLarge,
    Malformed,
}

/// Runs discovery against the configured binary.
pub async fn discover(config: &OpenCodeConfig) -> Result<Vec<OpenCodeModel>, DiscoveryError> {
    let binary = config
        .resolve_binary()
        .ok_or(DiscoveryError::BinaryNotFound)?;
    let args: Vec<OsString> = ["api", "--standalone", "model.list"]
        .iter()
        .map(OsString::from)
        .collect();
    let cwd = std::env::temp_dir();
    let mut child =
        SupervisedChild::spawn(&binary, &args, &cwd, false).map_err(|_| DiscoveryError::Spawn)?;
    let mut stdout = child.take_stdout().ok_or(DiscoveryError::Spawn)?;
    let exit_timeout = config.exit_timeout;

    let outcome = tokio::time::timeout(config.discovery_timeout, async {
        let mut body = Vec::new();
        let read = (&mut stdout)
            .take(u64::try_from(MAX_MODEL_LIST_BYTES + 1).unwrap_or(u64::MAX))
            .read_to_end(&mut body)
            .await;
        (read, body)
    })
    .await;
    let (read, body) = match outcome {
        Ok(result) => result,
        Err(_) => {
            child.kill().await;
            return Err(DiscoveryError::Timeout);
        }
    };
    if body.len() > MAX_MODEL_LIST_BYTES {
        child.kill().await;
        return Err(DiscoveryError::TooLarge);
    }
    if read.is_err() {
        child.kill().await;
        return Err(DiscoveryError::Exit);
    }
    let status = child.wait_or_kill(exit_timeout).await;
    if !status.is_some_and(|status| status.success()) {
        return Err(DiscoveryError::Exit);
    }
    parse_model_list(&body)
}

/// Decodes and maps a `model.list` response.
pub fn parse_model_list(body: &[u8]) -> Result<Vec<OpenCodeModel>, DiscoveryError> {
    let envelope: ModelListEnvelope =
        serde_json::from_slice(body).map_err(|_| DiscoveryError::Malformed)?;
    let mut models: Vec<OpenCodeModel> = envelope.data.into_iter().filter_map(map_model).collect();
    models.sort_by(|left, right| left.id.cmp(&right.id));
    models.dedup_by(|left, right| left.id == right.id);
    Ok(models)
}

fn map_model(model: WireModel) -> Option<OpenCodeModel> {
    if model.enabled == Some(false) {
        return None;
    }
    if !valid_provider_segment(&model.provider_id) || !valid_model_segment(&model.id) {
        return None;
    }
    let id = format!("{}/{}", model.provider_id, model.id);
    if id.len() > MAX_ID_LEN {
        return None;
    }
    let base_name = model
        .name
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| model.id.clone());
    let display_name: String = format!("{} ({})", base_name.trim(), model.provider_id)
        .chars()
        .take(MAX_DISPLAY_NAME_CHARS)
        .collect();
    let mut variants: Vec<String> = Vec::new();
    for variant in model.variants.unwrap_or_default() {
        if valid_variant(&variant.id) && !variants.contains(&variant.id) {
            variants.push(variant.id);
        }
    }
    Some(OpenCodeModel {
        id,
        display_name,
        variants,
    })
}

/// OpenCode ends the provider at the first `/` and forbids `/` and `#` in it.
fn valid_provider_segment(segment: &str) -> bool {
    plain_token(segment) && !segment.contains('/') && !segment.starts_with('-')
}

/// A model id may contain `/` (OpenRouter style) but never `#`.
fn valid_model_segment(segment: &str) -> bool {
    plain_token(segment)
}

fn valid_variant(variant: &str) -> bool {
    plain_token(variant) && !variant.contains('/') && variant.len() <= MAX_ID_LEN
}

fn plain_token(token: &str) -> bool {
    !token.is_empty()
        && !token.contains('#')
        && !token.chars().any(|c| c.is_whitespace() || c.is_control())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{"location":{"directory":"/tmp"},"data":[
        {"id":"claude-opus-5-5","providerID":"anthropic","name":"Claude Opus 5.5",
         "headers":{"authorization":"Bearer sk-never"},
         "variants":[{"id":"low","settings":{}},{"id":"max","settings":{}},{"id":"low"}]},
        {"id":"mimo-v2.6-flash","providerID":"opencode-go","name":"MiMo","variants":[]},
        {"id":"disabled","providerID":"opencode","enabled":false},
        {"id":"bad#id","providerID":"opencode"},
        {"id":"x","providerID":"bad/provider"},
        {"id":"anthropic/claude","providerID":"openrouter"},
        {"id":"no-name","providerID":"opencode","variants":[{"id":"has space"},{"id":"high"}]}
    ]}"#;

    #[test]
    fn maps_models_variants_and_names_from_the_live_shape() {
        let models = parse_model_list(SAMPLE.as_bytes()).expect("sample parses");
        let ids: Vec<&str> = models.iter().map(|model| model.id.as_str()).collect();
        assert_eq!(
            ids,
            vec![
                "anthropic/claude-opus-5-5",
                "opencode-go/mimo-v2.6-flash",
                "opencode/no-name",
                "openrouter/anthropic/claude",
            ]
        );
        assert_eq!(models[0].display_name, "Claude Opus 5.5 (anthropic)");
        assert_eq!(models[0].variants, vec!["low", "max"]);
        assert_eq!(models[2].display_name, "no-name (opencode)");
        assert_eq!(models[2].variants, vec!["high"]);
        assert!(!format!("{models:?}").contains("sk-never"));
    }

    #[test]
    fn variants_are_the_effort_stops_and_the_wire_suffix() {
        let models = parse_model_list(SAMPLE.as_bytes()).expect("sample parses");
        let opus = &models[0];
        assert_eq!(opus.effort_stops(), vec!["low", "max"]);
        assert_eq!(
            opus.wire_model("max").as_deref(),
            Some("anthropic/claude-opus-5-5#max")
        );
        assert_eq!(opus.wire_model("standard"), None);
        assert_eq!(opus.wire_model(DEFAULT_EFFORT_STOP), None);

        let plain = &models[1];
        assert_eq!(plain.effort_stops(), vec![DEFAULT_EFFORT_STOP]);
        assert_eq!(
            plain.wire_model(DEFAULT_EFFORT_STOP).as_deref(),
            Some("opencode-go/mimo-v2.6-flash")
        );
        assert_eq!(plain.wire_model("high"), None);
    }

    #[test]
    fn malformed_output_is_a_discovery_error() {
        assert_eq!(
            parse_model_list(b"not json"),
            Err(DiscoveryError::Malformed)
        );
        assert_eq!(
            parse_model_list(br#"{"data":"nope"}"#),
            Err(DiscoveryError::Malformed)
        );
        assert_eq!(parse_model_list(br#"{"data":[]}"#), Ok(Vec::new()));
    }
}
