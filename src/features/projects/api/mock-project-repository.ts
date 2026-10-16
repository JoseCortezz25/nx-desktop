/**
 * In-memory project list used until the Rust core exposes `list_projects`.
 *
 * Projects reference conversations by id only; the conversations module owns the
 * history, so the sidebar can group them without duplicating data.
 */
import type { Project } from '@/shared/domain/project.types';
import type { ProjectRepository } from './project-repository';

const projects: readonly Project[] = [
  {
    id: 'proj-design-system',
    name: 'Design system',
    workspaceFolders: ['/workspace/design-system'],
    conversationIds: ['conv-composer-chain', 'conv-diff-review']
  },
  {
    id: 'proj-api-client',
    name: 'API client',
    workspaceFolders: ['/workspace/api-client', '/workspace/shared-contracts'],
    conversationIds: ['conv-hooks-review']
  }
];

/**
 * Builds a `ProjectRepository` backed by the mock list above. A factory keeps
 * the seam identical to the future IPC client.
 */
export function createMockProjectRepository(): ProjectRepository {
  return {
    listProjects() {
      return Promise.resolve(projects);
    }
  };
}
