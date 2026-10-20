//! Provider catalog domain (issue #17).
//!
//! Pure product rules for the `provider -> model -> effort` selection chain
//! (`business-logic.md` §3.1): identities, catalog lookup and invariant
//! validation. No Tauri, no Serde wire attributes and no provider wire formats
//! — those live in `dto.rs`, `commands.rs` and `adapters/` respectively, per
//! the DTO ≠ Domain ≠ Provider Payload rule.

/// Maximum accepted length for catalog ids and effort stops (Limits tier).
pub const MAX_ID_LEN: usize = 128;

/// Identity of a coding-agent engine (`opencode`, `codex`, `claude`).
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ProviderId(String);

impl ProviderId {
    /// Builds an id, rejecting blank or overlong input at the Limits tier.
    pub fn new(id: impl Into<String>) -> Result<Self, SelectionChainError> {
        let id = id.into();
        if id.trim().is_empty() {
            return Err(SelectionChainError::EmptyProviderId);
        }
        if id.len() > MAX_ID_LEN {
            return Err(SelectionChainError::IdTooLong {
                field: "providerId",
                len: id.len(),
            });
        }
        Ok(Self(id))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Identity of a model, scoped strictly to its parent provider.
///
/// The parent link is structural — a `Model` only exists inside its
/// `Provider.available_models` — so a cross-provider model id is unrepresentable
/// here, not just rejected (`business-logic.md` §3.1, item 1).
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ModelId(String);

impl ModelId {
    /// Builds an id, rejecting blank or overlong input at the Limits tier.
    pub fn new(id: impl Into<String>) -> Result<Self, SelectionChainError> {
        let id = id.into();
        if id.trim().is_empty() {
            return Err(SelectionChainError::EmptyModelId);
        }
        if id.len() > MAX_ID_LEN {
            return Err(SelectionChainError::IdTooLong {
                field: "modelId",
                len: id.len(),
            });
        }
        Ok(Self(id))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// One effort stop a provider exposes for a model.
///
/// There is no universal ladder: stops come from the provider, vary per model,
/// and the concrete per-provider/per-model mapping is research ticket #31
/// (`business-logic.md` §3.1, item 4). Values carried here are placeholders
/// until that ticket lands.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct EffortLevel(String);

impl EffortLevel {
    /// Builds a stop, rejecting blank or overlong input at the Limits tier.
    pub fn new(level: impl Into<String>) -> Result<Self, SelectionChainError> {
        let level = level.into();
        if level.trim().is_empty() {
            return Err(SelectionChainError::EmptyEffortLevel);
        }
        if level.len() > MAX_ID_LEN {
            return Err(SelectionChainError::IdTooLong {
                field: "effortLevel",
                len: level.len(),
            });
        }
        Ok(Self(level))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// A model offered by a provider, without any wire representation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Model {
    pub id: ModelId,
    pub display_name: String,
    pub supported_effort_levels: Vec<EffortLevel>,
}

/// A coding-agent engine and the models it exposes, without any wire representation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Provider {
    pub id: ProviderId,
    pub display_name: String,
    pub icon: String,
    pub subtitle: String,
    pub available_models: Vec<Model>,
}

/// The ways a `provider -> model -> effort` chain can fail validation.
///
/// Kept free of IPC types on purpose: the service maps each variant to an
/// `AppErrorDto`, so this enum never decides wire codes itself.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SelectionChainError {
    EmptyProviderId,
    EmptyModelId,
    EmptyEffortLevel,
    IdTooLong {
        field: &'static str,
        len: usize,
    },
    UnknownProvider {
        provider_id: String,
    },
    UnknownModel {
        provider_id: String,
        model_id: String,
    },
    UnsupportedEffort {
        model_id: String,
        effort: String,
    },
}

/// Finds a provider in the catalog by id.
pub fn find_provider<'a>(catalog: &'a [Provider], id: &ProviderId) -> Option<&'a Provider> {
    catalog.iter().find(|provider| provider.id == *id)
}

/// Validates a full `provider -> model -> effort` chain against the catalog.
///
/// Transition rule (`business-logic.md` §3.1, item 2): every link must resolve
/// — the provider must be registered, the model must belong to that provider,
/// and the effort must be a stop that model exposes.
pub fn validate_selection_chain(
    catalog: &[Provider],
    provider_id: &ProviderId,
    model_id: &ModelId,
    effort: &EffortLevel,
) -> Result<(), SelectionChainError> {
    let provider = find_provider(catalog, provider_id).ok_or_else(|| {
        SelectionChainError::UnknownProvider {
            provider_id: provider_id.as_str().to_owned(),
        }
    })?;
    let model = provider
        .available_models
        .iter()
        .find(|model| model.id == *model_id)
        .ok_or_else(|| SelectionChainError::UnknownModel {
            provider_id: provider_id.as_str().to_owned(),
            model_id: model_id.as_str().to_owned(),
        })?;
    if !model
        .supported_effort_levels
        .iter()
        .any(|stop| stop == effort)
    {
        return Err(SelectionChainError::UnsupportedEffort {
            model_id: model_id.as_str().to_owned(),
            effort: effort.as_str().to_owned(),
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn catalog() -> Vec<Provider> {
        vec![Provider {
            id: ProviderId::new("opencode").expect("fixture id"),
            display_name: "OpenCode".to_owned(),
            icon: "opencode".to_owned(),
            subtitle: "Open-source coding agent".to_owned(),
            available_models: vec![Model {
                id: ModelId::new("deepseek-v3.1").expect("fixture id"),
                display_name: "DeepSeek V3.1".to_owned(),
                supported_effort_levels: vec![
                    EffortLevel::new("light").expect("fixture stop"),
                    EffortLevel::new("standard").expect("fixture stop"),
                ],
            }],
        }]
    }

    #[test]
    fn ids_reject_blank_input() {
        assert_eq!(
            ProviderId::new("  ").expect_err("blank provider id"),
            SelectionChainError::EmptyProviderId
        );
        assert_eq!(
            ModelId::new("").expect_err("empty model id"),
            SelectionChainError::EmptyModelId
        );
        assert_eq!(
            EffortLevel::new("").expect_err("empty effort stop"),
            SelectionChainError::EmptyEffortLevel
        );
    }

    #[test]
    fn valid_chain_resolves() {
        let catalog = catalog();
        let result = validate_selection_chain(
            &catalog,
            &ProviderId::new("opencode").expect("id"),
            &ModelId::new("deepseek-v3.1").expect("id"),
            &EffortLevel::new("light").expect("stop"),
        );
        assert_eq!(result, Ok(()));
    }

    #[test]
    fn unknown_provider_fails() {
        let catalog = catalog();
        let result = validate_selection_chain(
            &catalog,
            &ProviderId::new("codex").expect("id"),
            &ModelId::new("deepseek-v3.1").expect("id"),
            &EffortLevel::new("light").expect("stop"),
        );
        assert_eq!(
            result,
            Err(SelectionChainError::UnknownProvider {
                provider_id: "codex".to_owned(),
            })
        );
    }

    #[test]
    fn cross_provider_model_fails() {
        let catalog = catalog();
        let result = validate_selection_chain(
            &catalog,
            &ProviderId::new("opencode").expect("id"),
            &ModelId::new("gpt-5-codex").expect("id"),
            &EffortLevel::new("light").expect("stop"),
        );
        assert_eq!(
            result,
            Err(SelectionChainError::UnknownModel {
                provider_id: "opencode".to_owned(),
                model_id: "gpt-5-codex".to_owned(),
            })
        );
    }

    #[test]
    fn unadvertised_effort_stop_fails() {
        let catalog = catalog();
        let result = validate_selection_chain(
            &catalog,
            &ProviderId::new("opencode").expect("id"),
            &ModelId::new("deepseek-v3.1").expect("id"),
            &EffortLevel::new("maximum").expect("stop"),
        );
        assert_eq!(
            result,
            Err(SelectionChainError::UnsupportedEffort {
                model_id: "deepseek-v3.1".to_owned(),
                effort: "maximum".to_owned(),
            })
        );
    }
}
