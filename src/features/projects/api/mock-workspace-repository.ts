/**
 * In-memory branch fixture behind the mock port and its tests. The running app
 * reads the IPC-backed repository (#22).
 *
 * Every project's workspace reports a **different** branch list, so the
 * environment popover cannot be built against a single shared list and the
 * composer's reconciliation (switching project invalidates the previous branch)
 * has something real to survive.
 *
 * The list is private to this module: consumers read branches through the port.
 */
import type { ProjectId } from '@/shared/domain/value-objects.types';
import type { WorkspaceRepository } from './workspace-repository';

const BRANCHES_BY_PROJECT: Readonly<Record<ProjectId, readonly string[]>> = {
  'proj-design-system': ['main', 'feat/context-bar', 'fix/chip-contrast'],
  'proj-api-client': ['develop', 'release/2.0']
};

export function createMockWorkspaceRepository(): WorkspaceRepository {
  return {
    listBranches(projectId) {
      return Promise.resolve(BRANCHES_BY_PROJECT[projectId] ?? []);
    }
  };
}
