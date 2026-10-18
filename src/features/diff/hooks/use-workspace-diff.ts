/**
 * Loads the workspace change set through the typed diff port.
 *
 * The view never runs `git diff` and never reads the disk; it asks this hook,
 * which resolves the port (`diff-repository.ts`) so the mock repository today and
 * the IPC client later are swapped behind the same seam (`react-19` skill:
 * external async work lives in a feature hook, with an `isCancelled` guard for a
 * late-resolving read).
 */
import { useEffect, useState } from 'react';
import type { DiffFile } from '@/shared/domain/diff-file.types';
import { createMockDiffRepository } from '../api/mock-diff-repository';

export interface WorkspaceDiffState {
  /** The resolved change set, or `null` while the first read is in flight. */
  readonly files: readonly DiffFile[] | null;
  readonly isLoading: boolean;
}

export function useWorkspaceDiff(): WorkspaceDiffState {
  const [files, setFiles] = useState<readonly DiffFile[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;
    const repository = createMockDiffRepository();
    setIsLoading(true);

    void repository.readWorkspaceDiff().then(next => {
      if (isCancelled) {
        return;
      }
      setFiles(next);
      setIsLoading(false);
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  return { files, isLoading };
}
