//! Core tool-approval matrix (issue #20).
//!
//! Pure policy behind `Project.approval_mode` (`business-logic.md` §2,
//! §3.3). The decision is data, not UI: no request field can claim an approval,
//! and a `RequireApproval` answer must be satisfied by the Rust core before a
//! tool executes.
//!
//! **"Safe/scoped tools" assumption.** The product text for `auto_approve` says
//! "approve safe/scoped tools" without enumerating them. This ticket adopts the
//! conservative read-only set — `search`, `list_files` and `diff` — and keeps
//! `command` and `subagent` behind approval. The assumption is recorded in the
//! issue #20 task log; changing it is a product decision, not a code tweak.
//!
//! `full_access` removes the approval gate only: workspace path authority and
//! hook decisions are still enforced independently.

use crate::features::conversations::domain::ToolCallKind;
use crate::features::projects::domain::ApprovalMode;

/// How much authority a tool kind needs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolScope {
    /// Reads workspace state without changing it.
    ReadOnly,
    /// Arbitrary command execution or an opaque child agent.
    Opaque,
}

/// What the core must do before executing the tool.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApprovalDecision {
    /// The active mode already covers this tool.
    Allow,
    /// The core must obtain an explicit approval before executing.
    RequireApproval,
}

impl ApprovalDecision {
    pub fn is_allowed(self) -> bool {
        matches!(self, Self::Allow)
    }
}

/// Classifies one tool kind for the approval matrix.
pub fn tool_scope(kind: ToolCallKind) -> ToolScope {
    match kind {
        ToolCallKind::Search | ToolCallKind::ListFiles | ToolCallKind::Diff => ToolScope::ReadOnly,
        ToolCallKind::Command | ToolCallKind::Subagent => ToolScope::Opaque,
    }
}

/// Applies the project's approval mode to one tool kind.
pub fn evaluate(mode: ApprovalMode, kind: ToolCallKind) -> ApprovalDecision {
    match mode {
        ApprovalMode::AskAlways => ApprovalDecision::RequireApproval,
        ApprovalMode::AutoApprove => match tool_scope(kind) {
            ToolScope::ReadOnly => ApprovalDecision::Allow,
            ToolScope::Opaque => ApprovalDecision::RequireApproval,
        },
        ApprovalMode::FullAccess => ApprovalDecision::Allow,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ALL_KINDS: [ToolCallKind; 5] = [
        ToolCallKind::Search,
        ToolCallKind::Command,
        ToolCallKind::ListFiles,
        ToolCallKind::Diff,
        ToolCallKind::Subagent,
    ];

    #[test]
    fn ask_always_requires_approval_for_every_tool() {
        for kind in ALL_KINDS {
            assert_eq!(
                evaluate(ApprovalMode::AskAlways, kind),
                ApprovalDecision::RequireApproval,
                "{kind:?} must be gated under ask_always"
            );
        }
    }

    #[test]
    fn auto_approve_allows_only_read_only_tools() {
        for kind in ALL_KINDS {
            let expected = match tool_scope(kind) {
                ToolScope::ReadOnly => ApprovalDecision::Allow,
                ToolScope::Opaque => ApprovalDecision::RequireApproval,
            };
            assert_eq!(
                evaluate(ApprovalMode::AutoApprove, kind),
                expected,
                "unexpected auto_approve decision for {kind:?}"
            );
        }
        assert!(evaluate(ApprovalMode::AutoApprove, ToolCallKind::Search).is_allowed());
        assert_eq!(
            evaluate(ApprovalMode::AutoApprove, ToolCallKind::Command),
            ApprovalDecision::RequireApproval
        );
        assert_eq!(
            evaluate(ApprovalMode::AutoApprove, ToolCallKind::Subagent),
            ApprovalDecision::RequireApproval
        );
    }

    #[test]
    fn full_access_allows_every_tool_within_policy() {
        for kind in ALL_KINDS {
            assert_eq!(
                evaluate(ApprovalMode::FullAccess, kind),
                ApprovalDecision::Allow,
                "{kind:?} must be allowed under full_access"
            );
        }
    }

    #[test]
    fn command_and_subagent_are_the_opaque_kinds() {
        assert_eq!(tool_scope(ToolCallKind::Command), ToolScope::Opaque);
        assert_eq!(tool_scope(ToolCallKind::Subagent), ToolScope::Opaque);
        assert_eq!(tool_scope(ToolCallKind::Search), ToolScope::ReadOnly);
        assert_eq!(tool_scope(ToolCallKind::ListFiles), ToolScope::ReadOnly);
        assert_eq!(tool_scope(ToolCallKind::Diff), ToolScope::ReadOnly);
    }
}
