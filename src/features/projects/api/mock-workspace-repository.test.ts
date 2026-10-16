import { describe, expect, it } from 'vitest';
import { resolveRunEnvironment } from '@/shared/domain/selection-chain';
import { createMockWorkspaceRepository } from './mock-workspace-repository';

/**
 * Guards the property the ticket requires of the branch list: it is served by
 * the workspace port, and it differs per project, so the environment popover
 * cannot be built against a hardcoded branch.
 */
describe('mock workspace repository', () => {
  const untouched = {
    useNewWorktree: false,
    environmentName: ''
  } as const;

  it('serves each project its own branches through the port', async () => {
    const repository = createMockWorkspaceRepository();

    const designSystem = await repository.listBranches('proj-design-system');
    const apiClient = await repository.listBranches('proj-api-client');

    expect(designSystem).toEqual([
      'main',
      'feat/context-bar',
      'fix/chip-contrast'
    ]);
    expect(apiClient).toEqual(['develop', 'release/2.0']);
    expect(designSystem).not.toEqual(apiClient);
  });

  it('reports no branches for a project whose workspace is unknown', async () => {
    const repository = createMockWorkspaceRepository();

    expect(await repository.listBranches('missing')).toEqual([]);
  });

  it('never keeps a hardcoded branch the workspace does not report', async () => {
    const repository = createMockWorkspaceRepository();
    const apiClient = await repository.listBranches('proj-api-client');

    // `main` is what the wireframe draws, but this workspace does not have it.
    expect(apiClient).not.toContain('main');

    const reconciled = resolveRunEnvironment(
      { ...untouched, gitBranch: 'main' },
      apiClient
    );

    expect(reconciled.gitBranch).toBe('develop');
  });

  it('starts the environment on the first branch the port reports', async () => {
    const repository = createMockWorkspaceRepository();
    const designSystem = await repository.listBranches('proj-design-system');

    const reconciled = resolveRunEnvironment(
      { ...untouched, gitBranch: '' },
      designSystem
    );

    expect(reconciled.gitBranch).toBe('main');
    expect(reconciled.useNewWorktree).toBe(false);
    expect(reconciled.environmentName).toBe('');
  });
});
