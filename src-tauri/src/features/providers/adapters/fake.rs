//! In-memory provider adapter (issue #17).
//!
//! Serves the frozen #16 fixture catalog so `list_providers` / `list_models`
//! return exactly the wire shapes the contract pins. This is scaffolding, not
//! an engine integration: the real `opencode.rs` / `codex.rs` / `claude.rs`
//! adapters belong to #25–#27 and replace the rows here with engine-supplied
//! data.
//!
//! The `supportedEffortLevels` values are placeholders, not product truth: the
//! concrete per-provider/per-model mapping is research ticket #31
//! (`business-logic.md` §3.1, item 4).

use super::super::domain::{EffortLevel, Model, ModelId, Provider, ProviderId};
use super::super::ports::AgentProvider;

/// Fake engine source returning the fixture catalog.
#[derive(Debug, Default, Clone, Copy)]
pub struct FakeAgentProvider;

impl FakeAgentProvider {
    fn catalog_rows() -> Vec<Provider> {
        vec![
            Provider {
                id: must_id("opencode"),
                display_name: "OpenCode".to_owned(),
                icon: "opencode".to_owned(),
                subtitle: "Open-source coding agent".to_owned(),
                available_models: vec![
                    Model {
                        id: must_model("deepseek-v3.1"),
                        display_name: "DeepSeek V3.1".to_owned(),
                        supported_effort_levels: vec![
                            must_effort("light"),
                            must_effort("standard"),
                            must_effort("high"),
                        ],
                    },
                    Model {
                        id: must_model("kimi-k2"),
                        display_name: "Kimi K2".to_owned(),
                        supported_effort_levels: vec![
                            must_effort("light"),
                            must_effort("standard"),
                        ],
                    },
                ],
            },
            Provider {
                id: must_id("codex"),
                display_name: "Codex".to_owned(),
                icon: "codex".to_owned(),
                subtitle: "OpenAI coding agent".to_owned(),
                available_models: vec![Model {
                    id: must_model("gpt-5-codex"),
                    display_name: "GPT-5 Codex".to_owned(),
                    supported_effort_levels: vec![
                        must_effort("light"),
                        must_effort("standard"),
                        must_effort("high"),
                        must_effort("extended"),
                    ],
                }],
            },
        ]
    }
}

impl AgentProvider for FakeAgentProvider {
    fn catalog(&self) -> Vec<Provider> {
        Self::catalog_rows()
    }
}

fn must_id(id: &str) -> ProviderId {
    ProviderId::new(id).expect("fixture provider id is non-empty")
}

fn must_model(id: &str) -> ModelId {
    ModelId::new(id).expect("fixture model id is non-empty")
}

fn must_effort(stop: &str) -> EffortLevel {
    EffortLevel::new(stop).expect("fixture effort stop is non-empty")
}

#[cfg(test)]
mod tests {
    use super::super::super::domain::find_provider;
    use super::*;

    #[test]
    fn fake_catalog_matches_the_fixture_rows() {
        let catalog = FakeAgentProvider.catalog();
        let ids: Vec<&str> = catalog
            .iter()
            .map(|provider| provider.id.as_str())
            .collect();
        assert_eq!(ids, vec!["opencode", "codex"]);

        let opencode = find_provider(&catalog, &ProviderId::new("opencode").expect("id"))
            .expect("opencode is registered");
        let model_ids: Vec<&str> = opencode
            .available_models
            .iter()
            .map(|model| model.id.as_str())
            .collect();
        assert_eq!(model_ids, vec!["deepseek-v3.1", "kimi-k2"]);
    }
}
