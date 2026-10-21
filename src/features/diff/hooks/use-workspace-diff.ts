/**
 * Loads the workspace change set through the typed diff port.
 *
 * The view never runs `git diff` and never reads the disk; it asks this hook,
 * which reads through the IPC-backed repository (`ipc-diff-repository.ts`, #24)
 * bound to the active project, so the Rust core inspects that project's
 * authorized roots (`react-19` skill: external async work lives in a feature
 * hook). The view mounts per `Cambios` tab activation, so each visit reads the
 * workspace's current state.
 *
 * A result is tagged with the project it answers and the effect's
 * `isCancelled` guard drops a superseded read, so switching projects never
 * renders the previous workspace's changes as the current one.
 */
import { useEffect, useState } from 'react';
import type { DiffFile } from '@/shared/domain/diff-file.types';
import type { ProjectId } from '@/shared/domain/value-objects.types';
import { toAppErrorDto, type AppErrorDto } from '@/shared/ipc/contracts';
import { createIpcDiffRepository } from '../api/ipc-diff-repository';

export interface WorkspaceDiffState {
  /** The resolved change set, or `null` while loading, on error or with no project. */
  readonly files: readonly DiffFile[] | null;
  readonly isLoading: boolean;
  /** The normalized failure of the current read, or `null`. */
  readonly error: AppErrorDto | null;
}

interface DiffReadResult {
  readonly projectId: ProjectId;
  readonly files: readonly DiffFile[] | null;
  readonly error: AppErrorDto | null;
}

export function useWorkspaceDiff(
  projectId: ProjectId | null
): WorkspaceDiffState {
  const [result, setResult] = useState<DiffReadResult | null>(null);

  useEffect(() => {
    if (projectId === null) {
      return;
    }

    let isCancelled = false;

    createIpcDiffRepository(projectId)
      .readWorkspaceDiff()
      .then(
        files => {
          if (!isCancelled) {
            setResult({ projectId, files, error: null });
          }
        },
        (error: unknown) => {
          if (!isCancelled) {
            setResult({ projectId, files: null, error: toAppErrorDto(error) });
          }
        }
      );

    return () => {
      isCancelled = true;
    };
  }, [projectId]);

  if (projectId === null) {
    return { files: null, isLoading: false, error: null };
  }
  if (result === null || result.projectId !== projectId) {
    return { files: null, isLoading: true, error: null };
  }
  return { files: result.files, isLoading: false, error: result.error };
}
