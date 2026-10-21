/**
 * IPC-backed workspace diff (issue #24).
 *
 * Implements `DiffRepository` over `read_workspace_diff` (#21, git adapter). The
 * repository is bound to one project at construction: `projectId` is the
 * authority anchor the Rust core resolves to canonicalized workspace roots
 * before it inspects the change set. Counts and file order are the core's and
 * are mapped through unchanged.
 */
import type {
  DiffFile,
  DiffHunk,
  DiffLine
} from '@/shared/domain/diff-file.types';
import type { ProjectId } from '@/shared/domain/value-objects.types';
import { readWorkspaceDiff } from './diff-client';
import type { DiffFileDto, DiffHunkDto, DiffLineDto } from './diff.contracts';
import type { DiffRepository } from './diff-repository';

function toDiffLine(dto: DiffLineDto): DiffLine {
  return { kind: dto.kind, content: dto.content };
}

function toDiffHunk(dto: DiffHunkDto): DiffHunk {
  return { header: dto.header, lines: dto.lines.map(toDiffLine) };
}

function toDiffFile(dto: DiffFileDto): DiffFile {
  return {
    path: dto.path,
    addedCount: dto.addedCount,
    removedCount: dto.removedCount,
    hunks: dto.hunks.map(toDiffHunk)
  };
}

/** Builds the diff port for `projectId` over the typed IPC client. */
export function createIpcDiffRepository(projectId: ProjectId): DiffRepository {
  return {
    readWorkspaceDiff() {
      return readWorkspaceDiff(projectId).then(rows => rows.map(toDiffFile));
    }
  };
}
