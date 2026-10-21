//! Concrete provider adapters (issues #17, #25).
//!
//! `fake` serves the fixture catalog; `claude` is the first real engine
//! adapter (catalog + run streaming over the Messages API); `env_credentials`
//! is the first `CredentialSource`. The `opencode` / `codex` engine adapters
//! belong to #26–#27.

pub mod claude;
pub mod env_credentials;
pub mod fake;
