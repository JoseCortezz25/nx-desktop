/**
 * IPC-backed project catalog (issue #22).
 *
 * Implements `ProjectRepository` over the typed project client. The core
 * decides ids and defaults, persists every write, and returns the full
 * catalog so the hook keeps one owner for the picker and the sidebar.
 */
import type { Project } from '@/shared/domain/project.types';
import {
  createProject,
  listProjects,
  setProjectApprovalMode
} from './project-client';
import type { CreatedProjectDto, ProjectDto } from './project.contracts';
import type { CreatedProject, ProjectRepository } from './project-repository';

function toProject(dto: ProjectDto): Project {
  return {
    id: dto.id,
    name: dto.name,
    workspaceFolders: [...dto.workspaceFolders],
    approvalMode: dto.approvalMode,
    hookDecisions: dto.hookDecisions.map(decision => ({ ...decision })),
    conversationIds: [...dto.conversationIds]
  };
}

function toCreatedProject(dto: CreatedProjectDto): CreatedProject {
  return {
    project: toProject(dto.project),
    projects: dto.projects.map(toProject)
  };
}

/** Builds the project port over the typed IPC client. */
export function createIpcProjectRepository(): ProjectRepository {
  return {
    listProjects() {
      return listProjects().then(rows => rows.map(toProject));
    },

    createProject(input) {
      return createProject(input).then(toCreatedProject);
    },

    setApprovalMode(projectId, approvalMode) {
      return setProjectApprovalMode(projectId, approvalMode).then(rows =>
        rows.map(toProject)
      );
    }
  };
}
