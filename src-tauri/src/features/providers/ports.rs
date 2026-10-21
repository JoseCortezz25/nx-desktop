//! Provider integration port (issue #17).
//!
//! A trait exists here because a real external boundary is behind it: the
//! coding-agent engines (`OpenCode`, `Codex`, `Claude`) are separate processes
//! or SDKs with one implementation each (#25–#27). The catalog query below is
//! the only method this issue needs; run execution and streaming belong to
//! #19 and the per-engine adapter tickets and are deliberately absent.
//!
//! [`CredentialSource`] (issue #25) is the seam where provider secrets enter
//! the Rust core. The first adapter reads the process environment; an OS
//! keychain adapter can replace it later without touching the engines.

use super::domain::{Provider, ProviderCredential, ProviderId};

/// Source of the provider catalog the selectors render.
///
/// Implementations translate between the engine they wrap and the domain
/// `Provider` values; vendor payloads never leak through this trait.
pub trait AgentProvider: Send + Sync {
    /// Returns every configured provider with its advertised models.
    fn catalog(&self) -> Vec<Provider>;
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
