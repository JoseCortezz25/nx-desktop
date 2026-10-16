/**
 * Loads one workspace file through the typed file port.
 *
 * The viewer never reads the disk; it asks this hook, which resolves the port
 * (`file-repository.ts`) so the mock repository today and the IPC client later
 * are swapped behind the same seam (`react-19` skill: external async work lives
 * in a feature hook, with an `isCancelled` guard for a late-resolving read).
 */
import { useEffect, useState } from 'react';
import type { FileDocument } from '@/shared/domain/file-document.types';
import { createMockFileRepository } from '../api/mock-file-repository';

export interface FileDocumentState {
  /** The resolved document, or `null` while loading or when the path is empty. */
  readonly document: FileDocument | null;
  readonly isLoading: boolean;
}

export function useFileDocument(path: string | null): FileDocumentState {
  const [document, setDocument] = useState<FileDocument | null>(null);
  const [isLoading, setIsLoading] = useState(path !== null);

  useEffect(() => {
    if (path === null) {
      setDocument(null);
      setIsLoading(false);
      return;
    }

    let isCancelled = false;
    const repository = createMockFileRepository();
    setIsLoading(true);

    void repository.readDocument(path).then(next => {
      if (isCancelled) {
        return;
      }
      setDocument(next);
      setIsLoading(false);
    });

    return () => {
      isCancelled = true;
    };
  }, [path]);

  return { document, isLoading };
}
