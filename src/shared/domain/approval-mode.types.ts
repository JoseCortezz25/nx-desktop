/**
 * Tool approval policy for a project.
 *
 * The three documented levels are enforced in the Rust core, never by UI hiding
 * alone (`.claude/knowledge/business-logic.md` §2 and §3.3).
 *
 * Locked rule (decision 2026-10-16, issue #30): the policy is **project-scoped**.
 * It lives on the `Project` (`Project.approvalMode`); it is not global and not
 * per conversation.
 */
export const APPROVAL_MODES = [
  'ask_always',
  'auto_approve',
  'full_access'
] as const;

/** Tool execution policy applied to every run in a project. */
export type ApprovalMode = (typeof APPROVAL_MODES)[number];
