//! Provider catalog DTOs (issue #16, slice 2).
//!
//! Wire shapes only: the service, command and adapter live in #17. Rust fields
//! stay `snake_case`; `#[serde(rename_all = "camelCase")]` emits the JSON the
//! TypeScript contract and the shared fixtures pin.

use serde::{Deserialize, Serialize};

/// One model exposed by a provider, scoped strictly to that provider.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelDto {
    pub id: String,
    pub display_name: String,
    pub provider_id: String,
    /// Effort stops supplied by the provider/model; there is no global ladder.
    pub supported_effort_levels: Vec<String>,
}

/// A coding-agent engine and its model catalog.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderDto {
    pub id: String,
    pub display_name: String,
    pub icon: String,
    pub subtitle: String,
    pub available_models: Vec<ModelDto>,
}

/// Request envelope for `list_models`; a model catalog is provider-scoped.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ListModelsRequestDto {
    pub provider_id: String,
}
