/**
 * In-memory project fixture behind the mock port and its tests. The running app
 * reads the IPC-backed repository (#22).
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
 * Creation (#9) appends through the same port. The id is a deterministic counter
 * (`proj-created-1`, `proj-created-2`, …) rather than a name-derived slug,
 * because the issue specifies no uniqueness rule: two projects may legitimately
 * share a name, so the id must not be derived from one. A created project starts
 * at `ask_always` — the most restrictive approval level — since the issue
 * specifies no default and a required field still needs a value.
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
  let createdCount = 0;

  return {
    listProjects() {
      return Promise.resolve(projects);
    },

    createProject(input) {
      createdCount += 1;
      const project: Project = {
        id: `proj-created-${createdCount}`,
        name: input.name,
        workspaceFolders: [...input.folders],
        approvalMode: 'ask_always',
        hookDecisions: [],
        conversationIds: []
      };
      projects = [...projects, project];

      return Promise.resolve({ project, projects });
    },

    setApprovalMode(projectId, approvalMode) {
      projects = projects.map(project =>
        project.id === projectId ? { ...project, approvalMode } : project
      );
      return Promise.resolve(projects);
    }
  };
}
