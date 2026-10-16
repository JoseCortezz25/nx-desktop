/**
 * A configured lifecycle hook reviewed before a tool runs.
 *
 * Surfaced by the hooks review modal (`docs/wireframes/README.md`, screens
 * 14–15; `.claude/knowledge/business-logic.md` §2 `Hook`). The approval status
 * values are provisional pending the open question about declined hooks (§4,
 * item 4).
 */
import type { HookId } from './value-objects.types';

/** Hook trigger point, e.g. `PreToolUse`. */
export type HookType = string;

/** Who contributed the hook (project config, user config, a plugin, ...). */
export type HookOrigin = string;

export const HOOK_APPROVAL_STATUSES = [
  'pending',
  'approved',
  'rejected'
] as const;

/** Whether the user allowed, deferred, or declined this hook. */
export type HookApprovalStatus = (typeof HOOK_APPROVAL_STATUSES)[number];

export interface Hook {
  readonly id: HookId;
  readonly name: string;
  /** Drives the "new" badge in the review modal. */
  readonly isNew: boolean;
  readonly origin: HookOrigin;
  readonly hookType: HookType;
  readonly command: string;
  readonly timeoutMs: number;
  readonly approvalStatus: HookApprovalStatus;
}
