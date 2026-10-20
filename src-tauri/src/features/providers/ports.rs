//! Provider integration port (issue #17).
//!
//! A trait exists here because a real external boundary is behind it: the
//! coding-agent engines (`OpenCode`, `Codex`, `Claude`) are separate processes
//! or SDKs with one implementation each (#25–#27). The catalog query below is
//! the only method this issue needs; run execution and streaming belong to
//! #19 and the per-engine adapter tickets and are deliberately absent.

use super::domain::Provider;

/// Source of the provider catalog the selectors render.
///
/// Implementations translate between the engine they wrap and the domain
/// `Provider` values; vendor payloads never leak through this trait.
pub trait AgentProvider: Send + Sync {
    /// Returns every configured provider with its advertised models.
    fn catalog(&self) -> Vec<Provider>;
}
