//! Concrete provider adapters (issues #17, #25).
//!
//! `fake` serves the fixture catalog; `claude` is the first real engine
//! adapter (catalog + run streaming over the Messages API); `env_credentials`
//! is the first `CredentialSource`. `opencode` (#27) drives the OpenCode CLI
//! as a supervised child process and discovers its models at runtime.

pub mod claude;
pub mod env_credentials;
pub mod fake;
pub mod opencode;
