/**
 * Port for the provider-reported hooks awaiting review and the project-scoped
 * decision about each one.
 *
 * The IPC-backed repository (`ipc-hook-repository.ts`) implements this port at
 * runtime (#24) over `list_hooks` / `set_hook_decision` (#20); it is bound to
 * one project, because the decision is remembered per `Project`
 * (`.claude/knowledge/business-logic.md` §2 `Hook`). The mock factory remains
 * as a test fixture. Views never read provider configuration directly.
 */
import type { Hook, HookApprovalStatus } from '@/shared/domain/hook.types';
import type { HookId } from '@/shared/domain/value-objects.types';

export interface HookRepository {
  /** Lists the hooks with the project's recorded decisions applied. */
  listHooks(): Promise<readonly Hook[]>;
  /**
   * Records one decision and resolves the hook as the core stored it, so the
   * UI renders the persisted status rather than the one it sent.
   */
  setHookDecision(
    hookId: HookId,
    approvalStatus: HookApprovalStatus
  ): Promise<Hook>;
}
