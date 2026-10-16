/**
 * Port for reading one workspace file into the right panel.
 *
 * Backed by the mock repository today and by the future typed IPC client
 * (`file-client.ts`) once the Rust core exposes a workspace-relative read
 * (`.claude/knowledge/business-logic.md` §3.3). The panel never reads the disk
 * itself.
 */
import type { FileDocument } from '@/shared/domain/file-document.types';

export interface FileRepository {
  /** Reads one file, or resolves `null` when the path holds no document. */
  readDocument(path: string): Promise<FileDocument | null>;
}
