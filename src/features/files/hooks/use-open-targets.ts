/**
 * Resolves the `Abrir` menu's machine report through the open-target port.
 *
 * The installed check is behind the port (`open-target-repository.ts`), so the
 * menu reads an availability list instead of asking about VS Code directly, and
 * the not-installed case is reachable without a second code path.
 */
import { useEffect, useState } from 'react';
import type {
  OpenTarget,
  OpenTargetAvailability
} from '@/shared/domain/open-target.types';
import { createMockOpenTargetRepository } from '../api/mock-open-target-repository';

export interface OpenTargetsState {
  /** What the machine reports; empty while the report loads. */
  readonly targets: readonly OpenTargetAvailability[];
  readonly isLoading: boolean;
  /** Stub action behind the port: opening a file into a target. */
  readonly openInTarget: (target: OpenTarget, path: string) => void;
}

export function useOpenTargets(): OpenTargetsState {
  const [targets, setTargets] = useState<readonly OpenTargetAvailability[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;
    const repository = createMockOpenTargetRepository();

    void repository.listOpenTargets().then(report => {
      if (isCancelled) {
        return;
      }
      setTargets(report);
      setIsLoading(false);
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  function openInTarget(target: OpenTarget, path: string) {
    // The mock is stateless, so the stub action builds one on demand like the
    // report does. Launching the target is a later ticket.
    void createMockOpenTargetRepository().openInTarget(target, path);
  }

  return { targets, isLoading, openInTarget };
}
