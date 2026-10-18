/**
 * Wire contracts for the hook review (issue #16, slice 4).
 *
 * A `Hook` is provider-reported, but the decision about it is **project-scoped**
 * (`.claude/knowledge/business-logic.md` §2 `Hook`, decision 2026-10-16): a hook
 * the user declines (`Ahora no`) is remembered per `Project` through a
 * `HookDecision`, not per run and not globally. Both requests therefore carry
 * the authority-bearing `projectId`; neither carries a `runId`, because the
 * decision survives the run that surfaced it. The status values are the closed
 * `HookApprovalStatus` set, shared with the project catalog.
 */
import type { HookApprovalStatus } from '@/shared/domain/hook.types';
import type { HookId, ProjectId } from '@/shared/domain/value-objects.types';

/** Request envelope for `list_hooks`; the project resolves its decisions. */
export interface ListHooksRequestDto {
  projectId: ProjectId;
}

/**
 * A configured lifecycle hook as reviewed in the modal.
 *
 * `hookType` and `origin` stay open strings because they are provider data, not
 * an enum this contract can close; `approvalStatus` is the closed set the
 * decision below writes.
 */
export interface HookDto {
  id: HookId;
  name: string;
  isNew: boolean;
  origin: string;
  hookType: string;
  command: string;
  timeoutMs: number;
  approvalStatus: HookApprovalStatus;
}

/**
 * Request envelope for `set_hook_decision`.
 *
 * The project remembers the decision, so `projectId` is the authority anchor;
 * `hookId` is the reviewed hook's identity. Rust validates that the hook exists
 * for that project before recording the closed status (#20).
 */
export interface SetHookDecisionRequestDto {
  projectId: ProjectId;
  hookId: HookId;
  approvalStatus: HookApprovalStatus;
}
