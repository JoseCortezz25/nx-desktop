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

/**
 * The level that removes the tool-call guardrail.
 *
 * The wireframe draws this level — and the composer chip while it is selected —
 * with the warning treatment (`docs/wireframes/10-approval-mode.html`), so the
 * UI has to recognise it without retyping the union.
 */
export const UNRESTRICTED_APPROVAL_MODE: ApprovalMode = 'full_access';

/**
 * Narrows an untyped value to a documented level.
 *
 * `SelectList` reports a plain string id, so the approval picker must prove a
 * selection is one of the three domain levels before handing it back up.
 */
export function isApprovalMode(value: string): value is ApprovalMode {
  return APPROVAL_MODES.some(mode => mode === value);
}

/** True when the level is the unrestricted one the wireframe draws as a warning. */
export function isUnrestrictedApprovalMode(mode: ApprovalMode): boolean {
  return mode === UNRESTRICTED_APPROVAL_MODE;
}
