/**
 * Port for reading one workspace file into the right panel.
 *
 * Backed by the mock repository today and by the typed IPC client once the UI
 * wiring lands in #24 (the Rust read exists in #21;
 * `.claude/knowledge/business-logic.md` §3.3). The panel never reads the disk
 * itself.
 */
import type { FileDocument } from '@/shared/domain/file-document.types';

export interface FileRepository {
  /** Reads one file, or resolves `null` when the path holds no document. */
  readDocument(path: string): Promise<FileDocument | null>;
}
