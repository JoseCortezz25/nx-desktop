/**
 * Typed IPC client for the project catalog (issue #16, slice 2).
 *
 * Signatures mirror `ProjectRepository` so #18/#22 can replace the mock
 * without changing call sites. The core decides the created id and defaults;
 * the request carries only the validated name and chosen folders.
 */
import type { ApprovalMode } from '@/shared/domain/approval-mode.types';
import type { ProjectId } from '@/shared/domain/value-objects.types';
import { ipcInvoke } from '@/shared/ipc/client';
import type { CreateProjectInput } from '../model/create-project.types';
import type {
  CreateProjectRequestDto,
  CreatedProjectDto,
  ProjectDto,
  SetProjectApprovalModeRequestDto
} from './project.contracts';

/** Lists every project with its workspace roots and project-scoped settings. */
export function listProjects(): Promise<ProjectDto[]> {
  return ipcInvoke<ProjectDto[]>('list_projects');
}

/** Creates one project and returns it with the updated catalog. */
export function createProject(
  input: CreateProjectInput
): Promise<CreatedProjectDto> {
  const request: CreateProjectRequestDto = {
    name: input.name,
    folders: [...input.folders]
  };
  return ipcInvoke<CreatedProjectDto>('create_project', { request });
}

/** Persists one project's approval policy and returns the updated catalog. */
export function setProjectApprovalMode(
  projectId: ProjectId,
  approvalMode: ApprovalMode
): Promise<ProjectDto[]> {
  const request: SetProjectApprovalModeRequestDto = {
    projectId,
    approvalMode
  };
  return ipcInvoke<ProjectDto[]>('set_project_approval_mode', { request });
}
