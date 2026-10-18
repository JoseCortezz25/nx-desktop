/**
 * Typed IPC client for a project's workspace branches (issue #16, slice 2).
 *
 * The branch list is project-scoped and comes from the repository itself;
 * callers never hardcode a branch name (`business-logic.md` §3.4).
 */
import type { ProjectId } from '@/shared/domain/value-objects.types';
import { ipcInvoke } from '@/shared/ipc/client';
import type { ListWorkspaceBranchesRequestDto } from './workspace.contracts';

/** Lists the workspace branches of `projectId`, repository order preserved. */
export function listWorkspaceBranches(projectId: ProjectId): Promise<string[]> {
  const request: ListWorkspaceBranchesRequestDto = { projectId };
  return ipcInvoke<string[]>('list_workspace_branches', { request });
}
