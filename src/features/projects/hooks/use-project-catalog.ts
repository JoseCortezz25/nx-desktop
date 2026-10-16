/**
 * Loads the project list for the composer's context bar through the typed
 * project port, and writes the project-scoped approval policy back through the
 * same port.
 *
 * The approval level the composer shows is read from `Project.approvalMode`, so
 * the port write is what changes it; the hook never keeps a UI-local copy of the
 * policy (decision 2026-10-16, issue #30). Only the chosen project id is
 * presentation state, and it is reconciled during render by `resolveProject`.
 */
import { useEffect, useState } from 'react';
import type { ApprovalMode } from '@/shared/domain/approval-mode.types';
import type { Project } from '@/shared/domain/project.types';
import { resolveProject } from '@/shared/domain/selection-chain';
import type { ProjectId } from '@/shared/domain/value-objects.types';
import { createMockProjectRepository } from '../api/mock-project-repository';

export interface ProjectCatalogState {
  readonly projects: readonly Project[];
  /** The project whose approval policy the composer applies, or `null` while loading. */
  readonly activeProject: Project | null;
  readonly selectProject: (projectId: ProjectId) => void;
  readonly changeApprovalMode: (approvalMode: ApprovalMode) => void;
}

export function useProjectCatalog(): ProjectCatalogState {
  const [repository] = useState(createMockProjectRepository);
  const [projects, setProjects] = useState<readonly Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<ProjectId | null>(
    null
  );

  useEffect(() => {
    let isCancelled = false;

    void repository.listProjects().then(catalog => {
      if (isCancelled) {
        return;
      }
      setProjects(catalog);
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
    void repository.setApprovalMode(project.id, approvalMode).then(setProjects);
  }

  return { projects, activeProject, selectProject, changeApprovalMode };
}
