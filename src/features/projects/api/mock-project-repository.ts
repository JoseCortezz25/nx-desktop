/**
 * In-memory project list used until the Rust core exposes `list_projects`.
 *
 * Each project carries the two settings locked as project-scoped on 2026-10-16
 * (issue #30): the tool approval policy (`approvalMode`) and the remembered
 * decision per reviewed hook (`hookDecisions`). The seed deliberately gives the
 * two projects **different** approval policies, so the composer's chip cannot be
 * built against a single shared value.
 *
 * Projects reference conversations by id only; the conversations module owns the
 * history, so the sidebar can group them without duplicating data.
 *
 * The seed list is private to this module: consumers read projects through the
 * port so they survive the typed IPC client landing.
 */
import type { Project } from '@/shared/domain/project.types';
import type { ProjectRepository } from './project-repository';

const INITIAL_PROJECTS: readonly Project[] = [
  {
    id: 'proj-design-system',
    name: 'Design system',
    workspaceFolders: ['/workspace/design-system'],
    approvalMode: 'ask_always',
    hookDecisions: [],
    conversationIds: ['conv-composer-chain', 'conv-diff-review']
  },
  {
    id: 'proj-api-client',
    name: 'API client',
    workspaceFolders: ['/workspace/api-client', '/workspace/shared-contracts'],
    approvalMode: 'auto_approve',
    hookDecisions: [
      { hookId: 'hook-lint-on-write', approvalStatus: 'rejected' }
    ],
    conversationIds: ['conv-hooks-review']
  }
];

/**
 * Builds a `ProjectRepository` backed by the seed above. A factory keeps the
 * seam identical to the future IPC client, and gives each repository its own
 * mutable list so a policy change is a real repository write rather than a
 * shared module-level mutation.
 */
export function createMockProjectRepository(): ProjectRepository {
  let projects: readonly Project[] = INITIAL_PROJECTS;

  return {
    listProjects() {
      return Promise.resolve(projects);
    },

    setApprovalMode(projectId, approvalMode) {
      projects = projects.map(project =>
        project.id === projectId ? { ...project, approvalMode } : project
      );
      return Promise.resolve(projects);
    }
  };
}
