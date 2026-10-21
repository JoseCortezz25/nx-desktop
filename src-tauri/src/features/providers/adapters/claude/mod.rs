//! Claude provider adapter (issue #25).
//!
//! One adapter, two ports: [`AgentProvider`] serves the Claude catalog to the
//! provider registry, and [`AgentRunner`] streams a run through the Messages
//! API into the same progress sink the fake runner uses, so the supervisor
//! emits the identical six-kind `Channel` frames.
//!
//! Layout:
//!
//! - `config.rs` — model table, effort mapping, endpoint and timeouts.
//! - `wire.rs` — vendor request/event/error payloads (never leave the adapter).
//! - `sse.rs` — chunk-boundary-safe server-sent events parser.
//! - `translate.rs` — vendor events → domain progress and outcome.
//! - `errors.rs` — vendor/HTTP/transport failures → `RunFailure`.
//! - `client.rs` — the `reqwest` transport with cancellation.
//!
//! Credentials come from a [`CredentialSource`] at run time. With none
//! configured the provider still lists, and each run fails with a mapped
//! `provider_unavailable` error before any network call.

mod client;
pub mod config;
mod errors;
mod sse;
mod translate;
mod wire;

use std::sync::Arc;

use self::client::ClaudeHttpClient;
use self::config::{CLAUDE_PROVIDER_ID, ClaudeConfig, wire_effort};
use self::errors::missing_credential;
use self::wire::MessagesRequest;
use super::super::domain::{EffortLevel, Model, ModelId, Provider, ProviderId};
use super::super::ports::{AgentProvider, CredentialSource};
use crate::features::runs::domain::RunFailure;
use crate::features::runs::ports::{
    AgentRunner, BoxFuture, Cancellation, RunExecutionRequest, RunProgressSink,
};

/// Why the adapter could not be constructed.
#[derive(Debug)]
pub enum ClaudeSetupError {
    /// The configured provider id failed domain validation.
    InvalidProviderId,
    /// The HTTP/TLS client failed to initialise.
    HttpClient,
}

/// The Claude engine adapter.
pub struct ClaudeAgentProvider {
    provider_id: ProviderId,
    client: ClaudeHttpClient,
    credentials: Arc<dyn CredentialSource>,
}

impl ClaudeAgentProvider {
    pub fn new(
        config: ClaudeConfig,
        credentials: Arc<dyn CredentialSource>,
    ) -> Result<Self, ClaudeSetupError> {
        let provider_id =
            ProviderId::new(CLAUDE_PROVIDER_ID).map_err(|_| ClaudeSetupError::InvalidProviderId)?;
        let client = ClaudeHttpClient::new(config).map_err(|_| ClaudeSetupError::HttpClient)?;
        Ok(Self {
            provider_id,
            client,
            credentials,
        })
    }

    /// Provider id this adapter serves (`claude`).
    pub fn provider_id(&self) -> &ProviderId {
        &self.provider_id
    }

    async fn run(
        &self,
        request: RunExecutionRequest,
        cancellation: Cancellation,
        sink: Arc<dyn RunProgressSink>,
    ) -> Result<(), RunFailure> {
        let config = self.client.config();
        let model = config.find_model(&request.model_id).ok_or_else(|| {
            RunFailure::internal("the selected model is not offered by the Claude adapter")
        })?;
        let effort = wire_effort(model, &request.effort_level).ok_or_else(|| {
            RunFailure::internal("the selected effort level is not supported by this Claude model")
        })?;
        let credential = self
            .credentials
            .resolve(&self.provider_id)
            .ok_or_else(missing_credential)?;
        if cancellation.is_cancelled() {
            return Err(RunFailure::cancelled());
        }
        let body = MessagesRequest::user_turn(model.id, config.max_tokens, &request.prompt, effort);
        self.client
            .stream_message(&credential, &body, &cancellation, sink.as_ref())
            .await
    }
}

impl AgentProvider for ClaudeAgentProvider {
    fn catalog(&self) -> Vec<Provider> {
        let models = self
            .client
            .config()
            .models
            .iter()
            .filter_map(|model| {
                Some(Model {
                    id: ModelId::new(model.id).ok()?,
                    display_name: model.display_name.to_owned(),
                    supported_effort_levels: model
                        .effort_levels
                        .iter()
                        .filter_map(|level| EffortLevel::new(*level).ok())
                        .collect(),
                })
            })
            .collect();
        vec![Provider {
            id: self.provider_id.clone(),
            display_name: "Claude".to_owned(),
            icon: "claude".to_owned(),
            subtitle: "Anthropic coding agent".to_owned(),
            available_models: models,
        }]
    }
}

impl AgentRunner for ClaudeAgentProvider {
    fn execute<'a>(
        &'a self,
        request: RunExecutionRequest,
        cancellation: Cancellation,
        sink: Arc<dyn RunProgressSink>,
    ) -> BoxFuture<'a, Result<(), RunFailure>> {
        Box::pin(self.run(request, cancellation, sink))
    }
}

#[cfg(test)]
mod tests;
