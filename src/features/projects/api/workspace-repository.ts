/**
 * Port for the git branches of a project's workspace.
 *
 * `RunEnvironment.gitBranch` is one of the repository's own branches
 * (`.claude/knowledge/business-logic.md` §2 `RunEnvironment`), so the
 * environment popover reads the list here instead of hardcoding branch names —
 * The typed IPC-backed repository implements this port at runtime (#22); the
 * mock factory remains as a test fixture. The Rust core resolves the project's
 * authorized roots before listing branches.
 */
import type { ProjectId } from '@/shared/domain/value-objects.types';

export interface WorkspaceRepository {
  /**
   * The branches of the workspace behind `projectId`, in the order the
   * repository reports them (the first is the default the composer starts on).
   */
  listBranches(projectId: ProjectId): Promise<readonly string[]>;
}
