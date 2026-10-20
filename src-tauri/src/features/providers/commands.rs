//! Provider catalog commands (issue #17).
//!
//! Thin input adapters: validate the boundary (Shape via Serde, Limits via the
//! domain id constructors, Invariants via the registry), invoke the use case,
//! and map failures to [`AppErrorDto`]. No provider protocols and no business
//! rules live here.

use std::sync::atomic::{AtomicU64, Ordering};

use tauri::State;

use super::domain::{Model, Provider, ProviderId, SelectionChainError};
use super::dto::{ListModelsRequestDto, ModelDto, ProviderDto};
use super::service::ProviderRegistry;
use crate::ipc::error::{AppErrorCode, AppErrorDto};

/// Monotonic suffix for command correlation ids (`req-<n>`).
static REQUEST_SEQ: AtomicU64 = AtomicU64::new(1);

fn request_id() -> String {
    format!("req-{}", REQUEST_SEQ.fetch_add(1, Ordering::Relaxed))
}

fn validation_error(error: SelectionChainError) -> AppErrorDto {
    let message = match &error {
        SelectionChainError::EmptyProviderId => "providerId must not be empty".to_owned(),
        SelectionChainError::EmptyModelId => "modelId must not be empty".to_owned(),
        SelectionChainError::EmptyEffortLevel => "effortLevel must not be empty".to_owned(),
        SelectionChainError::IdTooLong { field, len } => {
            format!("{field} exceeds the maximum accepted size ({len} bytes)")
        }
        SelectionChainError::UnknownProvider { provider_id } => {
            format!("unknown provider: {provider_id}")
        }
        SelectionChainError::UnknownModel {
            provider_id,
            model_id,
        } => format!("model {model_id} does not belong to provider {provider_id}"),
        SelectionChainError::UnsupportedEffort { model_id, effort } => {
            format!("model {model_id} does not expose effort stop {effort}")
        }
    };
    AppErrorDto::new(AppErrorCode::ValidationFailed, message, request_id())
}

fn to_model_dto(provider_id: &str, model: &Model) -> ModelDto {
    ModelDto {
        id: model.id.as_str().to_owned(),
        display_name: model.display_name.clone(),
        provider_id: provider_id.to_owned(),
        supported_effort_levels: model
            .supported_effort_levels
            .iter()
            .map(|stop| stop.as_str().to_owned())
            .collect(),
    }
}

fn to_provider_dto(provider: &Provider) -> ProviderDto {
    let provider_id = provider.id.as_str();
    ProviderDto {
        id: provider_id.to_owned(),
        display_name: provider.display_name.clone(),
        icon: provider.icon.clone(),
        subtitle: provider.subtitle.clone(),
        available_models: provider
            .available_models
            .iter()
            .map(|model| to_model_dto(provider_id, model))
            .collect(),
    }
}

/// Lists every configured provider with its advertised models.
#[tauri::command]
pub fn list_providers(
    registry: State<'_, ProviderRegistry>,
) -> Result<Vec<ProviderDto>, AppErrorDto> {
    Ok(registry
        .list_providers()
        .iter()
        .map(to_provider_dto)
        .collect())
}

/// Lists the models of one provider; a cross-provider or unknown id is
/// rejected with `validation_failed` (Invariants tier).
#[tauri::command]
pub fn list_models(
    registry: State<'_, ProviderRegistry>,
    request: ListModelsRequestDto,
) -> Result<Vec<ModelDto>, AppErrorDto> {
    let provider_id = ProviderId::new(request.provider_id).map_err(validation_error)?;
    let models = registry
        .list_models(&provider_id)
        .map_err(validation_error)?;
    Ok(models
        .iter()
        .map(|model| to_model_dto(provider_id.as_str(), model))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::super::adapters::fake::FakeAgentProvider;
    use super::super::ports::AgentProvider;
    use super::super::service::ProviderRegistry;
    use super::*;

    #[test]
    fn registry_output_matches_the_pinned_fixture() {
        let raw = include_str!("../../../../docs/ipc/fixtures/providers-list-providers.json");
        // Fixture file is valid JSON; a parse failure means the contract moved.
        let fixture: serde_json::Value =
            serde_json::from_str(raw).expect("provider fixture parses");
        let expected: Vec<ProviderDto> = serde_json::from_value(fixture["response"].clone())
            .expect("fixture response deserializes");
        let registry = ProviderRegistry::new(&FakeAgentProvider);
        let actual: Vec<ProviderDto> = registry
            .list_providers()
            .iter()
            .map(to_provider_dto)
            .collect();
        assert_eq!(actual, expected);
    }

    #[test]
    fn provider_dto_conversion_matches_the_fixture_shape() {
        let catalog = FakeAgentProvider.catalog();
        let dto = to_provider_dto(&catalog[0]);
        assert_eq!(dto.id, "opencode");
        assert_eq!(dto.available_models.len(), 2);
        assert_eq!(dto.available_models[0].provider_id, "opencode");
        assert_eq!(
            dto.available_models[0].supported_effort_levels,
            vec!["light".to_owned(), "standard".to_owned(), "high".to_owned()]
        );
    }

    #[test]
    fn unknown_provider_maps_to_validation_failed() {
        let error = validation_error(SelectionChainError::UnknownProvider {
            provider_id: "nope".to_owned(),
        });
        assert_eq!(error.code, AppErrorCode::ValidationFailed);
        assert!(!error.retryable);
        assert!(error.request_id.starts_with("req-"));
    }

    #[test]
    fn oversized_id_maps_to_validation_failed() {
        let error = validation_error(SelectionChainError::IdTooLong {
            field: "providerId",
            len: 200,
        });
        assert_eq!(error.code, AppErrorCode::ValidationFailed);
        assert!(error.message.contains("providerId"));
    }
}
