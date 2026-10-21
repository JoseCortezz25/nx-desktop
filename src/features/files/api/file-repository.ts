/**
 * Port for reading one workspace file into the right panel.
 *
 * The IPC-backed repository (`ipc-file-repository.ts`) implements this port at
 * runtime (#24) over the Rust read from #21
 * (`.claude/knowledge/business-logic.md` §3.3); it is bound to one project, so
 * the path stays workspace-relative. The mock factory remains as a test fixture.
 * The panel never reads the disk itself.
 */
import type { FileDocument } from '@/shared/domain/file-document.types';

export interface FileRepository {
  /** Reads one file, or resolves `null` when the path holds no document. */
  readDocument(path: string): Promise<FileDocument | null>;
}
