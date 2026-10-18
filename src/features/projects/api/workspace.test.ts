/**
 * Contract and client tests for the workspace branch list (issue #16, slice 2).
 *
 * The request carries the authority-bearing `projectId`; the response is the
 * repository's branch order, which the composer consumes as `RunEnvironment`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import branchesFixture from '../../../../docs/ipc/fixtures/projects-list-workspace-branches.json';
import type { ListWorkspaceBranchesRequestDto } from './workspace.contracts';
import { listWorkspaceBranches } from './workspace-client';

const ipcInvoke = vi.hoisted(() => vi.fn());

vi.mock('@/shared/ipc/client', () => ({ ipcInvoke }));

const expectedRequest: ListWorkspaceBranchesRequestDto = {
  projectId: 'proj-design-system'
};
const expectedBranches: string[] = [
  'main',
  'feat/context-bar',
  'fix/chip-contrast'
];

beforeEach(() => {
  ipcInvoke.mockReset();
});

describe('workspace branch fixture', () => {
  it('matches the typed request and branch list', () => {
    expect(branchesFixture.request).toEqual(expectedRequest);
    expect(branchesFixture.response).toEqual(expectedBranches);
  });
});

describe('workspace client', () => {
  it('calls list_workspace_branches with the project envelope', async () => {
    ipcInvoke.mockResolvedValue(expectedBranches);
    await expect(listWorkspaceBranches('proj-design-system')).resolves.toEqual(
      expectedBranches
    );
    expect(ipcInvoke).toHaveBeenCalledWith('list_workspace_branches', {
      request: expectedRequest
    });
  });
});
