/**
 * Loads the run's subagents through the typed port and owns their local state.
 *
 * The list, the individual stop and the detail read the same hook, so the
 * viewer and the row controls can never disagree about a subagent's status.
 * Backed by the mock repository today (decision 2026-10-16, §2 `Subagent`);
 * #19/#23 replace the port's backing with the `RunSupervisor` IPC client, and
 * the stop transition moves to `cancel_run`'s child scope then (`react-19`
 * skill: external state in a feature hook, idempotent subscription cleanup).
 */
import { useCallback, useEffect, useState } from 'react';
import type { Subagent } from '@/shared/domain/subagent.types';
import type { SubagentId } from '@/shared/domain/value-objects.types';
import { stopSubagent } from '../model/subagent-view';
import { createMockSubagentRepository } from '../api/mock-subagent-repository';

export interface SubagentCatalogState {
  /** The resolved run's subagents, or `null` while the first read is in flight. */
  readonly subagents: readonly Subagent[] | null;
  readonly isLoading: boolean;
  /**
   * Stops one subagent individually (§3.2): a `processing` record resolves to
   * `cancelled` locally, a record past its end state is left as it is. Pressing
   * twice with no change between reads is therefore a no-op, exactly like the
   * model rule the UI renders.
   */
  readonly stopSubagent: (id: SubagentId) => void;
}

export function useSubagentCatalog(): SubagentCatalogState {
  const [subagents, setSubagents] = useState<readonly Subagent[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;
    const repository = createMockSubagentRepository();
    setIsLoading(true);

    void repository.listSubagents().then(next => {
      if (isCancelled) {
        return;
      }
      setSubagents(next);
      setIsLoading(false);
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  const stop = useCallback((id: SubagentId) => {
    setSubagents(
      current =>
        current?.map(one => (one.id === id ? stopSubagent(one) : one)) ??
        current
    );
  }, []);

  return { subagents, isLoading, stopSubagent: stop };
}
