//! Claude Messages API HTTP transport (issue #25).
//!
//! Sends one streamed `POST /v1/messages` and pumps its SSE body through the
//! parser and translator into the run progress sink.
//!
//! Cancellation: every await (sending the request, reading the error body,
//! reading each stream chunk) races the run's [`Cancellation`]. When it
//! fires, the function returns `RunFailure::cancelled()` immediately and the
//! in-flight `reqwest` future / response body is dropped, which aborts the
//! HTTP request and closes the connection — no further bytes are consumed.
//!
//! Secrets: the API key is attached as a header marked *sensitive* (redacted
//! from `reqwest`/`http` debug output) and never appears in a failure, a log
//! line or a frame. Transport errors are reduced to fixed summaries because
//! their `Display` can include request details.

use futures_util::StreamExt;
use reqwest::header::{ACCEPT, CONTENT_TYPE, HeaderValue};

use super::config::ClaudeConfig;
use super::errors::{
    http_failure, malformed_stream, stalled_stream, transport_failure, truncated_stream,
    unusable_credential,
};
use super::sse::SseParser;
use super::translate::{StreamTranslator, Translation};
use super::wire::{ANTHROPIC_VERSION, MessagesRequest, StreamEvent};
use crate::features::providers::domain::ProviderCredential;
use crate::features::runs::domain::RunFailure;
use crate::features::runs::ports::{Cancellation, RunProgressSink};

/// Largest error body read to classify a non-2xx response.
const MAX_ERROR_BODY_BYTES: usize = 16 * 1024;

/// Thin HTTP client bound to one configuration.
pub struct ClaudeHttpClient {
    http: reqwest::Client,
    config: ClaudeConfig,
}

impl ClaudeHttpClient {
    /// Builds the client; fails only when the TLS backend cannot initialise.
    pub fn new(config: ClaudeConfig) -> Result<Self, reqwest::Error> {
        let http = reqwest::Client::builder()
            .connect_timeout(config.connect_timeout)
            .build()?;
        Ok(Self { http, config })
    }

    pub fn config(&self) -> &ClaudeConfig {
        &self.config
    }

    /// Streams one message, forwarding progress until the outcome.
    pub async fn stream_message(
        &self,
        credential: &ProviderCredential,
        body: &MessagesRequest<'_>,
        cancellation: &Cancellation,
        sink: &dyn RunProgressSink,
    ) -> Result<(), RunFailure> {
        let mut api_key =
            HeaderValue::from_str(credential.expose()).map_err(|_| unusable_credential())?;
        api_key.set_sensitive(true);

        let request = self
            .http
            .post(self.config.messages_url())
            .header("x-api-key", api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .header(CONTENT_TYPE, "application/json")
            .header(ACCEPT, "text/event-stream")
            .json(body);

        let idle = self.config.idle_timeout;
        let response = tokio::select! {
            biased;
            () = cancellation.cancelled() => return Err(RunFailure::cancelled()),
            sent = tokio::time::timeout(idle, request.send()) => match sent {
                Err(_) => return Err(stalled_stream()),
                Ok(Err(_)) => return Err(transport_failure()),
                Ok(Ok(response)) => response,
            },
        };

        let status = response.status();
        if !status.is_success() {
            let body = tokio::select! {
                biased;
                () = cancellation.cancelled() => return Err(RunFailure::cancelled()),
                body = tokio::time::timeout(idle, read_bounded(response, MAX_ERROR_BODY_BYTES)) => {
                    body.unwrap_or_default()
                }
            };
            return Err(http_failure(status.as_u16(), &body));
        }

        let mut stream = response.bytes_stream();
        let mut parser = SseParser::new();
        let mut translator = StreamTranslator::new();
        loop {
            let next = tokio::select! {
                biased;
                () = cancellation.cancelled() => return Err(RunFailure::cancelled()),
                next = tokio::time::timeout(idle, stream.next()) => next,
            };
            let chunk = match next {
                Err(_) => return Err(stalled_stream()),
                Ok(None) => return Err(truncated_stream()),
                Ok(Some(Err(_))) => return Err(transport_failure()),
                Ok(Some(Ok(chunk))) => chunk,
            };
            let events = parser.push(&chunk).map_err(|_| malformed_stream())?;
            for event in events {
                if event.data.is_empty() {
                    continue;
                }
                let decoded: StreamEvent =
                    serde_json::from_str(&event.data).map_err(|_| malformed_stream())?;
                // A cancel that lands mid-chunk must not leak further frames.
                if cancellation.is_cancelled() {
                    return Err(RunFailure::cancelled());
                }
                match translator.apply(decoded) {
                    Translation::Skip => {}
                    Translation::Text(text) => sink.text_delta(text),
                    Translation::Tool(tool_call) => sink.tool_activity(tool_call),
                    Translation::Finished(outcome) => return outcome,
                }
            }
        }
    }
}

/// Reads at most `limit` bytes of an error body; read failures yield what
/// was collected so far (classification falls back to the status).
async fn read_bounded(response: reqwest::Response, limit: usize) -> Vec<u8> {
    let mut body = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(Ok(chunk)) = stream.next().await {
        let room = limit.saturating_sub(body.len());
        body.extend_from_slice(&chunk[..chunk.len().min(room)]);
        if body.len() >= limit {
            break;
        }
    }
    body
}
