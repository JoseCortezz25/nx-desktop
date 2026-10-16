/**
 * Port for the project list behind the composer's context bar.
 *
 * Backed by the mock repository today and by the future typed IPC client
 * (`project-client.ts`) once the Rust core exposes `list_projects` and
 * `set_project_approval_mode`.
 */
import type { ApprovalMode } from '@/shared/domain/approval-mode.types';
import type { Project } from '@/shared/domain/project.types';
import type { ProjectId } from '@/shared/domain/value-objects.types';

export interface ProjectRepository {
  listProjects(): Promise<readonly Project[]>;

  /**
   * Persists one project's approval policy and returns the updated list.
   *
   * The policy is **project-scoped** (decision 2026-10-16, issue #30), so this
   * is the only way the composer may change it: the chip reads the level back
   * from `Project.approvalMode` instead of keeping a UI-local copy.
   */
  setApprovalMode(
    projectId: ProjectId,
    approvalMode: ApprovalMode
  ): Promise<readonly Project[]>;
}
