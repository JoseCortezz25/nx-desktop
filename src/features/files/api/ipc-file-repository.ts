/**
 * IPC-backed workspace file reads (issue #24).
 *
 * Implements `FileRepository` over `read_file` (#21). The repository is bound to
 * one project at construction: `projectId` is the authority anchor the Rust core
 * resolves to canonicalized workspace roots before it reads `path`, so the port
 * keeps its path-only shape while every read stays project-scoped.
 */
import type { FileDocument } from '@/shared/domain/file-document.types';
import type { ProjectId } from '@/shared/domain/value-objects.types';
import { readFile } from '@/features/projects/api/workspace-client';
import type { FileDocumentDto } from '@/features/projects/api/workspace.contracts';
import type { FileRepository } from './file-repository';

function toFileDocument(dto: FileDocumentDto): FileDocument {
  return { path: dto.path, content: dto.content };
}

/** Builds the file port for `projectId` over the typed IPC client. */
export function createIpcFileRepository(projectId: ProjectId): FileRepository {
  return {
    readDocument(path) {
      return readFile(projectId, path).then(dto =>
        dto === null ? null : toFileDocument(dto)
      );
    }
  };
}
