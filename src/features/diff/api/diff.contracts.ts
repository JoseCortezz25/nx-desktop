/**
 * Wire contract for the workspace diff (issue #16, slice 4).
 *
 * `DiffFile` is the right panel's change set
 * (`.claude/knowledge/business-logic.md` §2, §3.5 item 1): `unified` only,
 * `split` deferred. The request carries the authority-bearing `projectId`
 * because Rust resolves the project's workspace roots before inspecting the
 * change set (`business-logic.md` §3.3). These DTOs mirror
 * `src-tauri/src/features/diff/dto.rs`; enforcement belongs to #24, not here.
 */
import type { DiffLineKind } from '@/shared/domain/diff-file.types';
import type { ProjectId } from '@/shared/domain/value-objects.types';

/** Request envelope for `read_workspace_diff`. */
export interface ReadWorkspaceDiffRequestDto {
  projectId: ProjectId;
}

/** One line of a unified diff hunk. */
export interface DiffLineDto {
  kind: DiffLineKind;
  content: string;
}

/** One `@@` hunk of a changed file. */
export interface DiffHunkDto {
  header: string;
  lines: DiffLineDto[];
}

/**
 * One changed file, in the order the panel draws it.
 *
 * `addedCount` and `removedCount` are the repository's statement about its own
 * lines; the view never recomputes them from the hunks.
 */
export interface DiffFileDto {
  path: string;
  addedCount: number;
  removedCount: number;
  hunks: DiffHunkDto[];
}
