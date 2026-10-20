//! Run lifecycle domain (issue #19).
//!
//! Pure product rules for a single execution attempt: identities, the
//! `pending → streaming → completed | failed | cancelled` lifecycle
//! (`business-logic.md` §3.2), the validated start spec and the frames the
//! supervisor emits. No Tauri, no Serde wire attributes and no provider wire
//! formats — those live in `dto.rs`, `commands.rs` and `adapters/` respectively
//! (DTO ≠ Domain ≠ Provider Payload).

use crate::features::conversations::domain::{ConversationId, ToolCall};
use crate::features::projects::domain::ProjectId;
use crate::features::providers::domain::{EffortLevel, ModelId, ProviderId, SelectionChainError};

/// Maximum accepted length for run ids (Limits tier).
pub const MAX_ID_LEN: usize = 128;

/// Maximum accepted prompt size in bytes (Limits tier).
///
/// A run prompt is a single composer submission, not a pasted repository:
/// 64 KiB keeps the IPC payload bounded while leaving ample room for long
/// instructions and code snippets.
pub const MAX_PROMPT_BYTES: usize = 64 * 1024;

/// Maximum accepted git branch name length (Limits tier).
pub const MAX_BRANCH_LEN: usize = 512;

/// Maximum accepted environment name length (Limits tier).
pub const MAX_ENVIRONMENT_NAME_LEN: usize = 128;

/// Identity of one execution attempt (`run-00000001`, ...).
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct RunId(String);

impl RunId {
    /// Builds an id, rejecting blank or overlong input at the Limits tier.
    pub fn new(id: impl Into<String>) -> Result<Self, RunError> {
        let id = id.into();
        if id.trim().is_empty() {
            return Err(RunError::EmptyRunId);
        }
        if id.len() > MAX_ID_LEN {
            return Err(RunError::RunIdTooLong { len: id.len() });
        }
        Ok(Self(id))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// A validated composer prompt; the original bytes are preserved so user
/// whitespace and indentation survive.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunPrompt(String);

impl RunPrompt {
    /// Builds a prompt, rejecting blank or oversized input at the Limits tier.
    pub fn new(prompt: impl Into<String>) -> Result<Self, RunError> {
        let prompt = prompt.into();
        if prompt.trim().is_empty() {
            return Err(RunError::EmptyPrompt);
        }
        if prompt.len() > MAX_PROMPT_BYTES {
            return Err(RunError::PromptTooLong { len: prompt.len() });
        }
        Ok(Self(prompt))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Where a run executes, as chosen in the composer environment popover.
///
/// The values are validated here; materializing a fresh worktree is a later
/// workspace concern, not part of the supervisor.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunEnvironment {
    use_new_worktree: bool,
    git_branch: String,
    environment_name: String,
}

impl RunEnvironment {
    /// Validates the environment limits (branch and name non-empty and bounded).
    pub fn new(
        use_new_worktree: bool,
        git_branch: impl Into<String>,
        environment_name: impl Into<String>,
    ) -> Result<Self, RunError> {
        let git_branch = git_branch.into();
        if git_branch.trim().is_empty() {
            return Err(RunError::EmptyGitBranch);
        }
        if git_branch.len() > MAX_BRANCH_LEN {
            return Err(RunError::GitBranchTooLong {
                len: git_branch.len(),
            });
        }
        let environment_name = environment_name.into();
        if environment_name.len() > MAX_ENVIRONMENT_NAME_LEN {
            return Err(RunError::EnvironmentNameTooLong {
                len: environment_name.len(),
            });
        }
        Ok(Self {
            use_new_worktree,
            git_branch,
            environment_name,
        })
    }

    pub fn use_new_worktree(&self) -> bool {
        self.use_new_worktree
    }

    pub fn git_branch(&self) -> &str {
        &self.git_branch
    }

    pub fn environment_name(&self) -> &str {
        &self.environment_name
    }
}

/// A start request whose ids, prompt and environment already passed the
/// Limits tier. The service still owns the Invariants and Authority tiers
/// (selection chain, conversation parent, branch membership).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StartRunSpec {
    pub conversation_id: ConversationId,
    pub project_id: ProjectId,
    pub provider_id: ProviderId,
    pub model_id: ModelId,
    pub effort_level: EffortLevel,
    pub prompt: RunPrompt,
    pub environment: RunEnvironment,
}

/// Lifecycle state of a run.
///
/// `started` is a stream frame kind, not a status: a run that has emitted
/// `started` is [`RunStatus::Streaming`], and is [`RunStatus::Pending`] before
/// the first frame (`business-logic.md` §3.2).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RunStatus {
    Pending,
    Streaming,
    Completed,
    Failed,
    Cancelled,
}

impl RunStatus {
    /// Whether the run reached its single authoritative terminal state.
    pub fn is_terminal(self) -> bool {
        matches!(self, Self::Completed | Self::Failed | Self::Cancelled)
    }
}

/// Public classification of a failed attempt.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RunFailureCode {
    /// The provider adapter refused the run, timed out or crashed.
    ProviderUnavailable,
    /// The adapter failed without a safer public classification.
    Internal,
    /// The adapter observed cancellation and stopped.
    Cancelled,
}

impl RunFailureCode {
    /// Whether the caller may safely retry the same intent.
    pub fn is_retryable(self) -> bool {
        matches!(self, Self::ProviderUnavailable)
    }
}

/// Safe diagnostic summary of a failed attempt; never a raw adapter payload.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunFailure {
    pub code: RunFailureCode,
    pub message: String,
}

impl RunFailure {
    pub fn provider_unavailable(message: impl Into<String>) -> Self {
        Self {
            code: RunFailureCode::ProviderUnavailable,
            message: message.into(),
        }
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self {
            code: RunFailureCode::Internal,
            message: message.into(),
        }
    }

    pub fn cancelled() -> Self {
        Self {
            code: RunFailureCode::Cancelled,
            message: "run was cancelled".to_owned(),
        }
    }
}

/// One domain event of a run's stream.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RunEvent {
    Started,
    TextDelta { text: String },
    ToolActivity { tool_call: ToolCall },
    Completed,
    Failed { failure: RunFailure },
    Cancelled,
}

/// A domain event tagged with the run identity and its monotonic sequence.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunFrame {
    pub run_id: String,
    pub seq: u64,
    pub event: RunEvent,
}

/// Authoritative run snapshot every command returns.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunSnapshot {
    pub run_id: String,
    pub conversation_id: String,
    pub project_id: String,
    pub status: RunStatus,
}

/// The ways run validation can fail.
///
/// Kept free of IPC types on purpose: commands map each variant to an
/// `AppErrorDto`, so this enum never decides wire codes itself.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RunError {
    EmptyRunId,
    RunIdTooLong {
        len: usize,
    },
    EmptyPrompt,
    PromptTooLong {
        len: usize,
    },
    EmptyGitBranch,
    GitBranchTooLong {
        len: usize,
    },
    EnvironmentNameTooLong {
        len: usize,
    },
    UnknownConversation {
        conversation_id: String,
    },
    UnknownProject {
        project_id: String,
    },
    ConversationProjectMismatch {
        conversation_id: String,
        project_id: String,
    },
    UnknownRun {
        run_id: String,
    },
    SelectionChain(SelectionChainError),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn run_ids_reject_blank_input() {
        assert_eq!(
            RunId::new("  ").expect_err("blank run id"),
            RunError::EmptyRunId
        );
    }

    #[test]
    fn prompts_reject_blank_input() {
        assert_eq!(
            RunPrompt::new("   ").expect_err("blank prompt"),
            RunError::EmptyPrompt
        );
    }

    #[test]
    fn prompts_reject_oversized_input() {
        let prompt = "p".repeat(MAX_PROMPT_BYTES + 1);
        assert_eq!(
            RunPrompt::new(prompt).expect_err("oversized prompt"),
            RunError::PromptTooLong {
                len: MAX_PROMPT_BYTES + 1,
            }
        );
    }

    #[test]
    fn environments_reject_a_blank_branch() {
        assert_eq!(
            RunEnvironment::new(false, " ", "local").expect_err("blank branch"),
            RunError::EmptyGitBranch
        );
    }

    #[test]
    fn environments_allow_an_unnamed_environment() {
        let environment =
            RunEnvironment::new(false, "main", "").expect("unnamed environment is allowed");
        assert_eq!(environment.environment_name(), "");
    }

    #[test]
    fn environments_keep_their_parts() {
        let environment =
            RunEnvironment::new(true, "feat/context-bar", "local").expect("valid environment");
        assert!(environment.use_new_worktree());
        assert_eq!(environment.git_branch(), "feat/context-bar");
        assert_eq!(environment.environment_name(), "local");
    }

    #[test]
    fn terminal_statuses_are_exactly_the_three_outcomes() {
        assert!(!RunStatus::Pending.is_terminal());
        assert!(!RunStatus::Streaming.is_terminal());
        assert!(RunStatus::Completed.is_terminal());
        assert!(RunStatus::Failed.is_terminal());
        assert!(RunStatus::Cancelled.is_terminal());
    }

    #[test]
    fn only_provider_outages_are_retryable() {
        assert!(RunFailureCode::ProviderUnavailable.is_retryable());
        assert!(!RunFailureCode::Internal.is_retryable());
        assert!(!RunFailureCode::Cancelled.is_retryable());
    }
}
