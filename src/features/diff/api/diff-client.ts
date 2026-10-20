/**
 * Typed IPC client for the workspace diff (issue #16, slice 4).
 *
 * The panel never runs `git diff` itself: the change set arrives as domain
 * values through this client, already counted, and a clean workspace resolves
 * to an empty list (`diff-repository.ts`). `projectId` is authority-bearing;
 * #21 implements the read and its path/inspection validation.
 */
import type { ProjectId } from '@/shared/domain/value-objects.types';
import { ipcInvoke } from '@/shared/ipc/client';
import type {
  DiffFileDto,
  ReadWorkspaceDiffRequestDto
} from './diff.contracts';

/**
 * Reads the changed files of `projectId`'s workspace.
 *
 * A clean workspace resolves to `[]`, never `null`; file order is the
 * repository's and the panel draws it unchanged.
 */
export function readWorkspaceDiff(
  projectId: ProjectId
): Promise<DiffFileDto[]> {
  const request: ReadWorkspaceDiffRequestDto = { projectId };
  return ipcInvoke<DiffFileDto[]>('read_workspace_diff', { request });
}
