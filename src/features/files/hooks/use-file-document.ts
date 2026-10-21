/**
 * Loads one workspace file through the typed file port.
 *
 * The viewer never reads the disk; it asks this hook, which reads through the
 * IPC-backed repository (`ipc-file-repository.ts`, #24) bound to the active
 * project, so the Rust core resolves the project's roots and validates the path
 * before reading (`react-19` skill: external async work lives in a feature
 * hook).
 *
 * Stale responses are discarded twice over: the effect's `isCancelled` guard
 * drops a read whose `projectId`/`path` was superseded, and the stored result is
 * tagged with the request it answers, so a result for a previous file is never
 * rendered as the current one — the new request reads as loading until its own
 * answer lands.
 */
import { useEffect, useState } from 'react';
import type { FileDocument } from '@/shared/domain/file-document.types';
import type {
  ProjectId,
  WorkspacePath
} from '@/shared/domain/value-objects.types';
import { toAppErrorDto, type AppErrorDto } from '@/shared/ipc/contracts';
import { createIpcFileRepository } from '../api/ipc-file-repository';

export interface FileDocumentState {
  /** The resolved document, or `null` while loading, on error or when absent. */
  readonly document: FileDocument | null;
  readonly isLoading: boolean;
  /** The normalized failure of the current read, or `null`. */
  readonly error: AppErrorDto | null;
}

interface FileReadResult {
  readonly projectId: ProjectId;
  readonly path: WorkspacePath;
  readonly document: FileDocument | null;
  readonly error: AppErrorDto | null;
}

const IDLE_STATE: FileDocumentState = {
  document: null,
  isLoading: false,
  error: null
};

const LOADING_STATE: FileDocumentState = {
  document: null,
  isLoading: true,
  error: null
};

export function useFileDocument(
  projectId: ProjectId | null,
  path: WorkspacePath | null
): FileDocumentState {
  const [result, setResult] = useState<FileReadResult | null>(null);

  useEffect(() => {
    if (projectId === null || path === null) {
      return;
    }

    let isCancelled = false;

    createIpcFileRepository(projectId)
      .readDocument(path)
      .then(
        document => {
          if (!isCancelled) {
            setResult({ projectId, path, document, error: null });
          }
        },
        (error: unknown) => {
          if (!isCancelled) {
            setResult({
              projectId,
              path,
              document: null,
              error: toAppErrorDto(error)
            });
          }
        }
      );

    return () => {
      isCancelled = true;
    };
  }, [projectId, path]);

  if (projectId === null || path === null) {
    return IDLE_STATE;
  }
  if (
    result === null ||
    result.projectId !== projectId ||
    result.path !== path
  ) {
    return LOADING_STATE;
  }
  return { document: result.document, isLoading: false, error: result.error };
}
