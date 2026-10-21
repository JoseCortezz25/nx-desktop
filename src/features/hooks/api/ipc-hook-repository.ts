/**
 * IPC-backed hook review (issue #24).
 *
 * Implements `HookRepository` over `list_hooks` and `set_hook_decision` (#20).
 * The repository is bound to one project at construction: `projectId` is the
 * authority anchor whose recorded `HookDecision`s the core applies to the list
 * and persists on every decision. The core validates that the hook belongs to
 * the project and returns the stored hook, which this adapter maps unchanged.
 */
import type { Hook } from '@/shared/domain/hook.types';
import type { ProjectId } from '@/shared/domain/value-objects.types';
import { listHooks, setHookDecision } from './hook-client';
import type { HookDto } from './hook.contracts';
import type { HookRepository } from './hook-repository';

function toHook(dto: HookDto): Hook {
  return {
    id: dto.id,
    name: dto.name,
    isNew: dto.isNew,
    origin: dto.origin,
    hookType: dto.hookType,
    command: dto.command,
    timeoutMs: dto.timeoutMs,
    approvalStatus: dto.approvalStatus
  };
}

/** Builds the hook port for `projectId` over the typed IPC client. */
export function createIpcHookRepository(projectId: ProjectId): HookRepository {
  return {
    listHooks() {
      return listHooks(projectId).then(rows => rows.map(toHook));
    },

    setHookDecision(hookId, approvalStatus) {
      return setHookDecision(projectId, hookId, approvalStatus).then(toHook);
    }
  };
}
