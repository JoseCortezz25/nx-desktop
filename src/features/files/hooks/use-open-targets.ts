/**
 * Resolves the `Abrir` menu's machine report and open action through the
 * open-target port.
 *
 * The installed check is behind the port (`open-target-repository.ts`), so the
 * menu reads an availability list instead of asking about VS Code directly, and
 * the not-installed case is reachable without a second code path. The report is
 * machine-scoped and read once; the launch is project-scoped and goes through
 * the IPC-backed repository with the active project (#24), whose roots the
 * Rust core validates the path against.
 */
import { useEffect, useState } from 'react';
import type {
  OpenTarget,
  OpenTargetAvailability
} from '@/shared/domain/open-target.types';
import type {
  ProjectId,
  WorkspacePath
} from '@/shared/domain/value-objects.types';
import { createIpcOpenTargetRepository } from '../api/ipc-open-target-repository';

export interface OpenTargetsState {
  /** What the machine reports; empty while the report loads or if it fails. */
  readonly targets: readonly OpenTargetAvailability[];
  readonly isLoading: boolean;
  /** Whether the last open request for this project was rejected by the core. */
  readonly hasOpenFailed: boolean;
  /** Asks the core to open `path` in `target` within the active project. */
  readonly openInTarget: (target: OpenTarget, path: WorkspacePath) => void;
}

interface OpenAttempt {
  readonly projectId: ProjectId;
  readonly hasFailed: boolean;
}

export function useOpenTargets(projectId: ProjectId | null): OpenTargetsState {
  const [repository] = useState(createIpcOpenTargetRepository);
  const [targets, setTargets] = useState<readonly OpenTargetAvailability[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastAttempt, setLastAttempt] = useState<OpenAttempt | null>(null);

  useEffect(() => {
    let isCancelled = false;

    repository.listOpenTargets().then(
      report => {
        if (!isCancelled) {
          setTargets(report);
          setIsLoading(false);
        }
      },
      () => {
        if (!isCancelled) {
          setTargets([]);
          setIsLoading(false);
        }
      }
    );

    return () => {
      isCancelled = true;
    };
  }, [repository]);

  function openInTarget(target: OpenTarget, path: WorkspacePath) {
    if (projectId === null) {
      return;
    }
    const requestProjectId = projectId;
    setLastAttempt({ projectId: requestProjectId, hasFailed: false });
    repository.openInTarget(requestProjectId, target, path).then(
      () => undefined,
      () => {
        // Tagged with its project, so a late rejection never surfaces under
        // a project the user switched to afterwards.
        setLastAttempt(current =>
          current?.projectId === requestProjectId
            ? { projectId: requestProjectId, hasFailed: true }
            : current
        );
      }
    );
  }

  const hasOpenFailed =
    lastAttempt !== null &&
    lastAttempt.projectId === projectId &&
    lastAttempt.hasFailed;

  return { targets, isLoading, hasOpenFailed, openInTarget };
}
