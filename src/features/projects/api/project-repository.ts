/**
 * Port for the project list behind the composer's context bar.
 *
 * The typed IPC-backed repository implements this port at runtime (#22); the
 * mock factory remains as a test fixture. The core decides ids, defaults and
 * persistence, so the port shape stays the same.
 */
import type { ApprovalMode } from '@/shared/domain/approval-mode.types';
import type { Project } from '@/shared/domain/project.types';
import type { ProjectId } from '@/shared/domain/value-objects.types';
import type { CreateProjectInput } from '../model/create-project.types';

/**
 * The row a creation produced, together with the list it joined.
 *
 * The updated list travels back with the created project because the port is
 * the only writer: the one catalog owner publishes both, so the picker and the
 * sidebar read the same list the repository now holds instead of an optimistic
 * copy the write might contradict.
 */
export interface CreatedProject {
  readonly project: Project;
  readonly projects: readonly Project[];
}

export interface ProjectRepository {
  listProjects(): Promise<readonly Project[]>;

  /**
   * Persists one new project and returns it with the updated list.
   *
   * The id and the project's defaults are the repository's to decide, not the
   * dialog's: the input carries only what the user supplied — the validated name
   * and the chosen source folders (#9).
   */
  createProject(input: CreateProjectInput): Promise<CreatedProject>;

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
