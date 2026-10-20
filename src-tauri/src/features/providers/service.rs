//! Provider catalog use cases (issue #17).
//!
//! Orchestrates the catalog owned by the Rust core: listing providers/models
//! and validating `provider -> model -> effort` chains for later consumers
//! (#19 reuses [`ProviderRegistry::validate_selection`]). The catalog snapshot
//! is loaded once from an [`AgentProvider`](super::ports::AgentProvider) and
//! held immutably, so readers never take a lock — there is no `MutexGuard` to
//! hold across `.await` by construction.

use super::domain::{
    EffortLevel, Model, ModelId, Provider, ProviderId, SelectionChainError, find_provider,
    validate_selection_chain,
};
use super::ports::AgentProvider;

/// Long-lived owner of the provider catalog snapshot.
pub struct ProviderRegistry {
    catalog: Vec<Provider>,
}

impl ProviderRegistry {
    /// Snapshots the catalog from the backing engine source.
    pub fn new(source: &dyn AgentProvider) -> Self {
        Self {
            catalog: source.catalog(),
        }
    }

    /// Every configured provider with its advertised models.
    pub fn list_providers(&self) -> Vec<Provider> {
        self.catalog.clone()
    }

    /// The models of one provider (Invariants tier: the provider must be
    /// registered; models are provider-scoped so no cross-provider id can
    /// resolve here).
    pub fn list_models(&self, provider_id: &ProviderId) -> Result<Vec<Model>, SelectionChainError> {
        find_provider(&self.catalog, provider_id)
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
        validate_selection_chain(&self.catalog, provider_id, model_id, effort)
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
