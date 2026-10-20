/**
 * Loads the branch list of the active project's workspace through the workspace
 * port.
 *
 * The composer reconciles its `RunEnvironment` against this list, so the branch
 * a run executes on always comes from the repository's own branches instead of a
 * hardcoded name (`.claude/knowledge/business-logic.md` §3.4). An empty list —
 * while a project is switching, or for a workspace that has no branches yet —
 * leaves the environment reconciler with nothing to choose from.
 */
import { useEffect, useState } from 'react';
import type { ProjectId } from '@/shared/domain/value-objects.types';
import { createIpcWorkspaceRepository } from '../api/ipc-workspace-repository';

export function useWorkspaceBranches(
  projectId: ProjectId | null
): readonly string[] {
  const [branches, setBranches] = useState<readonly string[]>([]);

  useEffect(() => {
    let isCancelled = false;
    const repository = createIpcWorkspaceRepository();

    setBranches([]);

    if (projectId) {
      void repository
        .listBranches(projectId)
        .then(list => {
          if (!isCancelled) {
            setBranches(list);
          }
        })
        .catch(() => {
          if (!isCancelled) {
            setBranches([]);
          }
        });
    }

    return () => {
      isCancelled = true;
    };
  }, [projectId]);

  return branches;
}
