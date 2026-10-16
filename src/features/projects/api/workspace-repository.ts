/**
 * Port for the git branches of a project's workspace.
 *
 * `RunEnvironment.gitBranch` is one of the repository's own branches
 * (`.claude/knowledge/business-logic.md` §2 `RunEnvironment`), so the
 * environment popover reads the list here instead of hardcoding branch names —
 * the wireframe's `main` is a placeholder (§3.4). Backed by the mock repository
 * today and by the future typed IPC client (`workspace-client.ts`) once the Rust
 * core exposes `list_workspace_branches`.
 */
import type { ProjectId } from '@/shared/domain/value-objects.types';

export interface WorkspaceRepository {
  /**
   * The branches of the workspace behind `projectId`, in the order the
   * repository reports them (the first is the default the composer starts on).
   */
  listBranches(projectId: ProjectId): Promise<readonly string[]>;
}
