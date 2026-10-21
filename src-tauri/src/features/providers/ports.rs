//! Provider integration port (issue #17).
//!
//! A trait exists here because a real external boundary is behind it: the
//! coding-agent engines (`OpenCode`, `Codex`, `Claude`) are separate processes
//! or SDKs with one implementation each (#25–#27). The catalog query below is
//! the only method this issue needs; run execution and streaming belong to
//! #19 and the per-engine adapter tickets and are deliberately absent.
//!
//! [`AgentProvider::ready`] (issue #27) lets an engine whose catalog is
//! discovered at runtime (OpenCode reads its own configuration through a
//! child process) finish or refresh that discovery before a listing. The
//! default is an immediately ready, static catalog.
//!
//! [`CredentialSource`] (issue #25) is the seam where provider secrets enter
//! the Rust core. The first adapter reads the process environment; an OS
//! keychain adapter can replace it later without touching the engines.

use std::future::Future;
use std::pin::Pin;

use super::domain::{Provider, ProviderCredential, ProviderId};

/// A boxed, sendable future returned by [`AgentProvider::ready`].
pub type CatalogReady<'a> = Pin<Box<dyn Future<Output = ()> + Send + 'a>>;

/// Source of the provider catalog the selectors render.
///
/// Implementations translate between the engine they wrap and the domain
/// `Provider` values; vendor payloads never leak through this trait.
pub trait AgentProvider: Send + Sync {
    /// Returns every configured provider with its advertised models.
    fn catalog(&self) -> Vec<Provider>;

    /// Resolves once [`AgentProvider::catalog`] reflects a completed (or
    /// failed, bounded) discovery. Static catalogs are always ready.
    fn ready(&self) -> CatalogReady<'_> {
        Box::pin(std::future::ready(()))
    }
}

/// Resolves the secret an engine adapter authenticates with.
///
/// Credentials live only in the Rust core: implementations must never log,
/// serialize or echo the value, and a missing credential is `None`, not an
/// error string that could carry a partial secret.
pub trait CredentialSource: Send + Sync {
    /// The credential configured for `provider_id`, if any.
    fn resolve(&self, provider_id: &ProviderId) -> Option<ProviderCredential>;
}
