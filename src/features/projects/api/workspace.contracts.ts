/**
 * Wire contract for the workspace branch list (issue #16, slice 2).
 *
 * `RunEnvironment.gitBranch` must come from the project's own repository
 * (`.claude/knowledge/business-logic.md` §2, §3.4), so the request carries the
 * authoritative `projectId` Rust validates against.
 */
import type { ProjectId } from '@/shared/domain/value-objects.types';

/** Request envelope for `list_workspace_branches`. */
export interface ListWorkspaceBranchesRequestDto {
  projectId: ProjectId;
}
