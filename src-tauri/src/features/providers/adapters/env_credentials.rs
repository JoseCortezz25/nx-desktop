//! Environment-variable credential adapter (issue #25).
//!
//! No credential-storage policy exists yet (no keychain, no settings screen),
//! so the first [`CredentialSource`] reads the secret from the process
//! environment of the Rust core. The webview never sees the environment, the
//! value is wrapped in the redacted [`ProviderCredential`] immediately, and
//! only providers with an explicit variable mapping can resolve anything.
//! `VITE_*` variables are never consulted: they are bundled into the frontend.

use super::super::domain::{ProviderCredential, ProviderId};
use super::super::ports::CredentialSource;

/// Variable the Claude adapter's API key is read from.
pub const ANTHROPIC_API_KEY_VAR: &str = "ANTHROPIC_API_KEY";

/// Reads a variable by name; injectable so tests never mutate the process
/// environment (`std::env::set_var` is `unsafe` in Rust 2024).
type EnvLookup = Box<dyn Fn(&str) -> Option<String> + Send + Sync>;

/// Resolves provider credentials from named environment variables.
pub struct EnvCredentialSource {
    mappings: Vec<(String, &'static str)>,
    lookup: EnvLookup,
}

impl EnvCredentialSource {
    /// The production source: `claude` → `ANTHROPIC_API_KEY`, read from the
    /// real process environment at resolution time.
    pub fn from_process_env() -> Self {
        Self::with_lookup(Box::new(|name| std::env::var(name).ok()))
    }

    /// Same mapping with an injected variable reader (tests).
    pub fn with_lookup(lookup: EnvLookup) -> Self {
        Self {
            mappings: vec![("claude".to_owned(), ANTHROPIC_API_KEY_VAR)],
            lookup,
        }
    }
}

impl CredentialSource for EnvCredentialSource {
    fn resolve(&self, provider_id: &ProviderId) -> Option<ProviderCredential> {
        let (_, variable) = self
            .mappings
            .iter()
            .find(|(id, _)| id == provider_id.as_str())?;
        (self.lookup)(variable).and_then(ProviderCredential::new)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn provider(id: &str) -> ProviderId {
        ProviderId::new(id).expect("test provider id")
    }

    #[test]
    fn resolves_the_claude_key_from_its_variable() {
        let source = EnvCredentialSource::with_lookup(Box::new(|name| {
            (name == ANTHROPIC_API_KEY_VAR).then(|| "sk-ant-test".to_owned())
        }));
        let credential = source.resolve(&provider("claude")).expect("configured");
        assert_eq!(credential.expose(), "sk-ant-test");
    }

    #[test]
    fn missing_or_blank_variables_resolve_to_none() {
        let missing = EnvCredentialSource::with_lookup(Box::new(|_| None));
        assert!(missing.resolve(&provider("claude")).is_none());
        let blank = EnvCredentialSource::with_lookup(Box::new(|_| Some("  ".to_owned())));
        assert!(blank.resolve(&provider("claude")).is_none());
    }

    #[test]
    fn unmapped_providers_never_resolve() {
        let source = EnvCredentialSource::with_lookup(Box::new(|_| Some("leak".to_owned())));
        assert!(source.resolve(&provider("opencode")).is_none());
    }
}
