/**
 * Repository tests for the IPC-backed workspace branches (issue #22).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createIpcWorkspaceRepository } from './ipc-workspace-repository';

const listWorkspaceBranches = vi.hoisted(() => vi.fn());

vi.mock('./workspace-client', () => ({ listWorkspaceBranches }));

beforeEach(() => {
  listWorkspaceBranches.mockReset();
});

describe('createIpcWorkspaceRepository', () => {
  it('delegates the project id and returns the repository order', async () => {
    listWorkspaceBranches.mockResolvedValue([
      'main',
      'feat/context-bar',
      'fix/chip-contrast'
    ]);

    const branches =
      await createIpcWorkspaceRepository().listBranches('proj-design-system');

    expect(listWorkspaceBranches).toHaveBeenCalledWith('proj-design-system');
    expect(branches).toEqual(['main', 'feat/context-bar', 'fix/chip-contrast']);
  });

  it('propagates a rejected client call', async () => {
    listWorkspaceBranches.mockRejectedValue(new Error('ipc unavailable'));
    await expect(
      createIpcWorkspaceRepository().listBranches('proj-design-system')
    ).rejects.toThrow('ipc unavailable');
  });
});
