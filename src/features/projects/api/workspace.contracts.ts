/**
 * Wire contracts for the workspace reads (issue #16, slices 2 and 4).
 *
 * `RunEnvironment.gitBranch` must come from the project's own repository
 * (`.claude/knowledge/business-logic.md` §2, §3.4), so the request carries the
 * authoritative `projectId` Rust validates against. The same authority anchor
 * applies to a workspace file read: `projectId` resolves the authorized roots
 * and `path` stays workspace-relative
 * (`.claude/knowledge/business-logic.md` §3.3). Neither field is enforcement;
 * `#21` validates them in Rust before touching the filesystem.
 */
import type {
  ProjectId,
  WorkspacePath
} from '@/shared/domain/value-objects.types';

/** Request envelope for `list_workspace_branches`. */
export interface ListWorkspaceBranchesRequestDto {
  projectId: ProjectId;
}

/**
 * Request envelope for `read_file`.
 *
 * `projectId` is authority-bearing and `path` is workspace-relative, the same
 * form a `FileChip` emits. The DTO carries the intent only; the Rust core
 * canonicalizes and validates the path against the project roots before any
 * read (`#21`).
 */
export interface ReadFileRequestDto {
  projectId: ProjectId;
  path: WorkspacePath;
}

/**
 * One workspace file as read through the port.
 *
 * The current `FileRepository.readDocument` resolves `null` when the path holds
 * no document; the wire keeps that distinction instead of inventing empty
 * content. `content` is the full file body, never a provider payload.
 */
export interface FileDocumentDto {
  path: WorkspacePath;
  content: string;
}
