/**
 * Loads the active project's hooks and records the user's decisions through the
 * IPC-backed hook port (#24).
 *
 * Rust owns the decision (#20): every write goes through `set_hook_decision`,
 * and the list only ever shows the hooks the core returned — there is no
 * optimistic status that could diverge from the persisted one. A partial
 * failure keeps the hooks the core did store and reports the failure.
 *
 * Every result is tagged with the project it answers, and the load effect's
 * `isCancelled` guard drops superseded reads, so a late response for a previous
 * project is never rendered or merged into the current one.
 */
import { useEffect, useState } from 'react';
import type { Hook, HookApprovalStatus } from '@/shared/domain/hook.types';
import type { HookId, ProjectId } from '@/shared/domain/value-objects.types';
import { toAppErrorDto, type AppErrorDto } from '@/shared/ipc/contracts';
import { createIpcHookRepository } from '../api/ipc-hook-repository';
import { applyStoredHooks } from '../model/hook-review';

export interface HookReviewState {
  /** The reviewed hooks, or `null` while the first read is in flight or failed. */
  readonly hooks: readonly Hook[] | null;
  readonly isLoading: boolean;
  /** The normalized failure of the current list read, or `null`. */
  readonly loadError: AppErrorDto | null;
  /** Whether a decision for the current project is being written. */
  readonly isDeciding: boolean;
  /** The failure of the last decision for the current project, or `null`. */
  readonly decisionError: AppErrorDto | null;
  /**
   * Records `approvalStatus` for each hook id and resolves `true` when every
   * write was stored. The list reflects what the core returned.
   */
  readonly decideHooks: (
    hookIds: readonly HookId[],
    approvalStatus: HookApprovalStatus
  ) => Promise<boolean>;
}

interface HookListResult {
  readonly projectId: ProjectId;
  readonly hooks: readonly Hook[] | null;
  readonly error: AppErrorDto | null;
}

interface HookDecisionResult {
  readonly projectId: ProjectId;
  readonly isDeciding: boolean;
  readonly error: AppErrorDto | null;
}

export function useHookReview(projectId: ProjectId | null): HookReviewState {
  const [list, setList] = useState<HookListResult | null>(null);
  const [decision, setDecision] = useState<HookDecisionResult | null>(null);

  useEffect(() => {
    if (projectId === null) {
      return;
    }

    let isCancelled = false;

    createIpcHookRepository(projectId)
      .listHooks()
      .then(
        hooks => {
          if (!isCancelled) {
            setList({ projectId, hooks, error: null });
          }
        },
        (error: unknown) => {
          if (!isCancelled) {
            setList({ projectId, hooks: null, error: toAppErrorDto(error) });
          }
        }
      );

    return () => {
      isCancelled = true;
    };
  }, [projectId]);

  function decideHooks(
    hookIds: readonly HookId[],
    approvalStatus: HookApprovalStatus
  ): Promise<boolean> {
    if (projectId === null) {
      return Promise.resolve(false);
    }
    if (hookIds.length === 0) {
      return Promise.resolve(true);
    }

    const requestProjectId = projectId;
    const repository = createIpcHookRepository(requestProjectId);
    setDecision({ projectId: requestProjectId, isDeciding: true, error: null });

    return Promise.allSettled(
      hookIds.map(hookId => repository.setHookDecision(hookId, approvalStatus))
    ).then(results => {
      const stored = results.flatMap(outcome =>
        outcome.status === 'fulfilled' ? [outcome.value] : []
      );
      const rejected = results.find(outcome => outcome.status === 'rejected');
      const error =
        rejected === undefined ? null : toAppErrorDto(rejected.reason);

      // Merged only into the list of the project that was decided on; a list
      // that has since moved to another project is left untouched.
      setList(current =>
        current !== null &&
        current.projectId === requestProjectId &&
        current.hooks !== null
          ? { ...current, hooks: applyStoredHooks(current.hooks, stored) }
          : current
      );
      setDecision(current =>
        current?.projectId === requestProjectId
          ? { projectId: requestProjectId, isDeciding: false, error }
          : current
      );
      return error === null;
    });
  }

  const currentList = list?.projectId === projectId ? list : null;
  const currentDecision = decision?.projectId === projectId ? decision : null;

  if (projectId === null) {
    return {
      hooks: [],
      isLoading: false,
      loadError: null,
      isDeciding: false,
      decisionError: null,
      decideHooks
    };
  }

  return {
    hooks: currentList?.hooks ?? null,
    isLoading: currentList === null,
    loadError: currentList?.error ?? null,
    isDeciding: currentDecision?.isDeciding ?? false,
    decisionError: currentDecision?.error ?? null,
    decideHooks
  };
}
