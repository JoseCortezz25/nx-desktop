/**
 * Tool approval policy for a run.
 *
 * The three documented levels are enforced in the Rust core, never by UI hiding
 * alone (`.claude/knowledge/business-logic.md` §2 and §3.3). Whether the policy is
 * global, per project, or per conversation is an open product question (§4,
 * item 2), so no owner is modelled here.
 */
export const APPROVAL_MODES = [
  'ask_always',
  'auto_approve',
  'full_access'
] as const;

/** Tool execution policy applied to a conversation or run. */
export type ApprovalMode = (typeof APPROVAL_MODES)[number];
