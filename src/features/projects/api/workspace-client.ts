/**
 * Typed IPC clients for the workspace reads (issue #16, slices 2 and 4).
 *
 * The branch list is project-scoped and comes from the repository itself;
 * callers never hardcode a branch name (`business-logic.md` §3.4). A file read
 * is likewise project-scoped: the request carries the authority-bearing
 * `projectId` and a workspace-relative `path`, and the Rust core validates both
 * before reading (`business-logic.md` §3.3, #21).
 */
import type {
  ProjectId,
  WorkspacePath
} from '@/shared/domain/value-objects.types';
import { ipcInvoke } from '@/shared/ipc/client';
import type {
  FileDocumentDto,
  ListWorkspaceBranchesRequestDto,
  ReadFileRequestDto
} from './workspace.contracts';

/** Lists the workspace branches of `projectId`, repository order preserved. */
export function listWorkspaceBranches(projectId: ProjectId): Promise<string[]> {
  const request: ListWorkspaceBranchesRequestDto = { projectId };
  return ipcInvoke<string[]>('list_workspace_branches', { request });
}

/**
 * Reads one workspace file, or resolves `null` when the path holds no document.
 *
 * The path stays workspace-relative; Rust resolves `projectId` to its
 * canonicalized roots and rejects traversal, symlink escapes and absolute paths
 * outside the workspace before reading.
 */
export function readFile(
  projectId: ProjectId,
  path: WorkspacePath
): Promise<FileDocumentDto | null> {
  const request: ReadFileRequestDto = { projectId, path };
  return ipcInvoke<FileDocumentDto | null>('read_file', { request });
}
