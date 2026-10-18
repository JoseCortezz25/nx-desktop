/**
 * Typed IPC clients for the hook review (issue #16, slice 4).
 *
 * Views never read provider configuration directly: the hook list and the
 * project-scoped decision both cross this client. The decision is remembered
 * per `Project` and survives the run that surfaced the hook
 * (`.claude/knowledge/business-logic.md` §2 `Hook`), so both calls carry
 * `projectId` and neither carries a `runId`. Recording and enforcement belong
 * to #20.
 */
import type { HookApprovalStatus } from '@/shared/domain/hook.types';
import type { HookId, ProjectId } from '@/shared/domain/value-objects.types';
import { ipcInvoke } from '@/shared/ipc/client';
import type {
  HookDto,
  ListHooksRequestDto,
  SetHookDecisionRequestDto
} from './hook.contracts';

/**
 * Lists the hooks awaiting review for `projectId`.
 *
 * The project context lets the core mark hooks this project already decided,
 * so a declined hook is not re-prompted on the next run.
 */
export function listHooks(projectId: ProjectId): Promise<HookDto[]> {
  const request: ListHooksRequestDto = { projectId };
  return ipcInvoke<HookDto[]>('list_hooks', { request });
}

/**
 * Records the user's decision about one hook for `projectId`.
 *
 * Resolves the updated hook so the modal can render the status the core
 * actually stored rather than the one it sent.
 */
export function setHookDecision(
  projectId: ProjectId,
  hookId: HookId,
  approvalStatus: HookApprovalStatus
): Promise<HookDto> {
  const request: SetHookDecisionRequestDto = {
    projectId,
    hookId,
    approvalStatus
  };
  return ipcInvoke<HookDto>('set_hook_decision', { request });
}
