/**
 * Loads the project list for the composer's context bar through the typed
 * project port, and writes back through the same port: the project-scoped
 * approval policy, and the new projects the create-project dialog (#9) submits.
 *
 * The approval level the composer shows is read from `Project.approvalMode`, so
 * the port write is what changes it; the hook never keeps a UI-local copy of the
 * policy (decision 2026-10-16, issue #30). Only the chosen project id is
 * presentation state, and it is reconciled during render by `resolveProject`.
 *
 * This hook is the **one** project catalog owner: the shell calls it once and
 * fans its state to the composer, the sidebar and the create-project dialog, so
 * there is no second repository instance that could desync them. The
 * repository is the IPC-backed port; the core persists every write (#22).
 */
import { useEffect, useState } from 'react';
import type { ApprovalMode } from '@/shared/domain/approval-mode.types';
import type { Project } from '@/shared/domain/project.types';
import { resolveProject } from '@/shared/domain/selection-chain';
import type { ProjectId } from '@/shared/domain/value-objects.types';
import { createIpcProjectRepository } from '../api/ipc-project-repository';
import type { CreateProjectInput } from '../model/create-project.types';

export interface ProjectCatalogState {
  readonly projects: readonly Project[];
  /** The project whose approval policy the composer applies, or `null` while loading. */
  readonly activeProject: Project | null;
  readonly selectProject: (projectId: ProjectId) => void;
  readonly changeApprovalMode: (approvalMode: ApprovalMode) => void;
  /**
   * Creates a project through the port and applies it: the list becomes the
   * repository's updated list and the new project becomes the active one, so the
   * picker and the sidebar show it immediately instead of only after a reload.
   */
  readonly createProject: (input: CreateProjectInput) => void;
}

export function useProjectCatalog(): ProjectCatalogState {
  const [repository] = useState(createIpcProjectRepository);
  const [projects, setProjects] = useState<readonly Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<ProjectId | null>(
    null
  );

  useEffect(() => {
    let isCancelled = false;

    void repository
      .listProjects()
      .then(catalog => {
        if (isCancelled) {
          return;
        }
        setProjects(catalog);
      })
      .catch(() => {
        if (!isCancelled) {
          setProjects([]);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [repository]);

  // Derived during render, so a late-arriving list becomes an active project
  // without an effect.
  const activeProject = resolveProject(projects, selectedProjectId);

  function selectProject(projectId: ProjectId) {
    setSelectedProjectId(projectId);
  }

  function changeApprovalMode(approvalMode: ApprovalMode) {
    const project = activeProject;
    if (!project) {
      return;
    }
    // The repository answers with the updated list, which becomes the state the
    // chip derives its level from.
    void repository
      .setApprovalMode(project.id, approvalMode)
      .then(setProjects)
      .catch(() => undefined);
  }

  function createProject(input: CreateProjectInput) {
    // The write lands on the same repository instance the shell already reads
    // through, and the created project is selected so the context bar reflects
    // what was just made.
    void repository
      .createProject(input)
      .then(created => {
        setProjects(created.projects);
        setSelectedProjectId(created.project.id);
      })
      .catch(() => undefined);
  }

  return {
    projects,
    activeProject,
    selectProject,
    changeApprovalMode,
    createProject
  };
}
