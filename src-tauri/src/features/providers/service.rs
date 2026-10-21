//! Provider catalog use cases (issue #17).
//!
//! Orchestrates the catalog owned by the Rust core: listing providers/models
//! and validating `provider -> model -> effort` chains for later consumers
//! (#19 reuses [`ProviderRegistry::validate_selection`]). The catalog snapshot
//! is loaded once from an [`AgentProvider`](super::ports::AgentProvider) and
//! held immutably, so readers never take a lock — there is no `MutexGuard` to
//! hold across `.await` by construction.
//!
//! Live sources (issue #27) are engines whose catalog is discovered at
//! runtime, such as OpenCode. They are read on every listing instead of being
//! snapshotted, and [`ProviderRegistry::ready`] awaits their discovery. A live
//! provider replaces a static provider with the same id in place, so the real
//! OpenCode adapter supersedes the fixture `opencode` row.

use super::domain::{
    EffortLevel, Model, ModelId, Provider, ProviderId, SelectionChainError, find_provider,
    validate_selection_chain,
};
use std::sync::Arc;

use super::ports::AgentProvider;

/// Long-lived owner of the provider catalog snapshot.
pub struct ProviderRegistry {
    catalog: Vec<Provider>,
    live: Vec<Arc<dyn AgentProvider>>,
}

impl ProviderRegistry {
    /// Snapshots the catalog from the backing engine source.
    pub fn new(source: &dyn AgentProvider) -> Self {
        Self {
            catalog: source.catalog(),
            live: Vec::new(),
        }
    }

    /// Snapshots and concatenates the catalogs of several engine sources, in
    /// order (issue #25: the fake catalog plus the Claude adapter). A provider
    /// id already contributed by an earlier source is skipped, so a duplicate
    /// registration can never make the selection chain ambiguous.
    pub fn from_sources(sources: &[&dyn AgentProvider]) -> Self {
        let mut catalog: Vec<Provider> = Vec::new();
        for source in sources {
            for provider in source.catalog() {
                if find_provider(&catalog, &provider.id).is_none() {
                    catalog.push(provider);
                }
            }
        }
        Self {
            catalog,
            live: Vec::new(),
        }
    }

    /// Adds a source whose catalog is read on every listing (issue #27).
    pub fn with_live_source(mut self, source: Arc<dyn AgentProvider>) -> Self {
        self.live.push(source);
        self
    }

    /// Awaits the discovery of every live source. Each source bounds its own
    /// wait, so a missing engine never blocks a listing indefinitely.
    pub async fn ready(&self) {
        for source in &self.live {
            source.ready().await;
        }
    }

    /// The static snapshot merged with the current live catalogs.
    fn current_catalog(&self) -> Vec<Provider> {
        let mut catalog = self.catalog.clone();
        for source in &self.live {
            for provider in source.catalog() {
                match catalog.iter_mut().find(|row| row.id == provider.id) {
                    Some(row) => *row = provider,
                    None => catalog.push(provider),
                }
            }
        }
        catalog
    }

    /// Every configured provider with its advertised models.
    pub fn list_providers(&self) -> Vec<Provider> {
        self.current_catalog()
    }

    /// The models of one provider (Invariants tier: the provider must be
    /// registered; models are provider-scoped so no cross-provider id can
    /// resolve here).
    pub fn list_models(&self, provider_id: &ProviderId) -> Result<Vec<Model>, SelectionChainError> {
        find_provider(&self.current_catalog(), provider_id)
            .map(|provider| provider.available_models.clone())
            .ok_or_else(|| SelectionChainError::UnknownProvider {
                provider_id: provider_id.as_str().to_owned(),
            })
    }

    /// Validates a full `provider -> model -> effort` chain against the
    /// snapshot (Limits tier via the id constructors, Invariants tier here).
    pub fn validate_selection(
        &self,
        provider_id: &ProviderId,
        model_id: &ModelId,
        effort: &EffortLevel,
    ) -> Result<(), SelectionChainError> {
        validate_selection_chain(&self.current_catalog(), provider_id, model_id, effort)
    }
}

#[cfg(test)]
mod tests {
    use super::super::adapters::fake::FakeAgentProvider;
    use super::*;

    fn registry() -> ProviderRegistry {
        ProviderRegistry::new(&FakeAgentProvider)
    }

    #[test]
    fn lists_both_fixture_providers() {
        let ids: Vec<String> = registry()
            .list_providers()
            .iter()
            .map(|provider| provider.id.as_str().to_owned())
            .collect();
        assert_eq!(ids, vec!["opencode".to_owned(), "codex".to_owned()]);
    }

    #[test]
    fn composes_several_sources_in_order_without_duplicates() {
        let registry = ProviderRegistry::from_sources(&[&FakeAgentProvider, &FakeAgentProvider]);
        let ids: Vec<String> = registry
            .list_providers()
            .iter()
            .map(|provider| provider.id.as_str().to_owned())
            .collect();
        assert_eq!(ids, vec!["opencode".to_owned(), "codex".to_owned()]);
    }

    struct LiveOpenCode;

    impl AgentProvider for LiveOpenCode {
        fn catalog(&self) -> Vec<Provider> {
            vec![Provider {
                id: ProviderId::new("opencode").expect("id"),
                display_name: "OpenCode".to_owned(),
                icon: "opencode".to_owned(),
                subtitle: "live".to_owned(),
                available_models: vec![Model {
                    id: ModelId::new("anthropic/claude-opus-5-5").expect("id"),
                    display_name: "Claude Opus 5.5".to_owned(),
                    supported_effort_levels: vec![EffortLevel::new("max").expect("stop")],
                }],
            }]
        }
    }

    #[tokio::test]
    async fn a_live_source_replaces_the_static_row_in_place() {
        let registry =
            ProviderRegistry::new(&FakeAgentProvider).with_live_source(Arc::new(LiveOpenCode));
        registry.ready().await;
        let providers = registry.list_providers();
        let ids: Vec<&str> = providers.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(ids, vec!["opencode", "codex"]);
        assert_eq!(providers[0].subtitle, "live");
        let opencode = ProviderId::new("opencode").expect("id");
        assert_eq!(
            registry.validate_selection(
                &opencode,
                &ModelId::new("anthropic/claude-opus-5-5").expect("id"),
                &EffortLevel::new("max").expect("stop"),
            ),
            Ok(())
        );
        assert!(
            registry
                .validate_selection(
                    &opencode,
                    &ModelId::new("deepseek-v3.1").expect("id"),
                    &EffortLevel::new("light").expect("stop"),
                )
                .is_err(),
            "fixture models no longer resolve once the live row replaces them"
        );
    }

    #[test]
    fn lists_opencode_models() {
        let provider_id = ProviderId::new("opencode").expect("id");
        let ids: Vec<String> = registry()
            .list_models(&provider_id)
            .expect("opencode is registered")
            .iter()
            .map(|model| model.id.as_str().to_owned())
            .collect();
        assert_eq!(ids, vec!["deepseek-v3.1".to_owned(), "kimi-k2".to_owned()]);
    }

    #[test]
    fn rejects_an_unknown_provider() {
        let provider_id = ProviderId::new("nope").expect("id");
        assert_eq!(
            registry().list_models(&provider_id).expect_err("unknown"),
            SelectionChainError::UnknownProvider {
                provider_id: "nope".to_owned(),
            }
        );
    }

    #[test]
    fn validates_a_full_chain_for_later_consumers() {
        let registry = registry();
        let valid = registry.validate_selection(
            &ProviderId::new("codex").expect("id"),
            &ModelId::new("gpt-5-codex").expect("id"),
            &EffortLevel::new("extended").expect("stop"),
        );
        assert_eq!(valid, Ok(()));

        let cross_provider = registry.validate_selection(
            &ProviderId::new("codex").expect("id"),
            &ModelId::new("kimi-k2").expect("id"),
            &EffortLevel::new("light").expect("stop"),
        );
        assert_eq!(
            cross_provider,
            Err(SelectionChainError::UnknownModel {
                provider_id: "codex".to_owned(),
                model_id: "kimi-k2".to_owned(),
            })
        );
    }
}
