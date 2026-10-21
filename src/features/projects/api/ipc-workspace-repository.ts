/**
 * IPC-backed workspace branches (issue #22).
 *
 * Implements `WorkspaceRepository` over `list_workspace_branches`, so the
 * environment popover reads the active project's real branch list instead of
 * the mock map. Rust resolves the project's authorized roots before listing.
 */
import type { ProjectId } from '@/shared/domain/value-objects.types';
import { listWorkspaceBranches } from './workspace-client';
import type { WorkspaceRepository } from './workspace-repository';

/** Builds the branch port over the typed IPC client. */
export function createIpcWorkspaceRepository(): WorkspaceRepository {
  return {
    listBranches(projectId: ProjectId) {
      return listWorkspaceBranches(projectId);
    }
  };
}
