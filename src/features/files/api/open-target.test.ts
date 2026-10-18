/**
 * Contract and client tests for the `Abrir` open targets (issue #16, slice 4).
 *
 * `list_open_targets` is parameterless; `open_in_target` carries the
 * authority-bearing project and the workspace-relative path. The fixture
 * response for the open is `null`, matching the port's `Promise<void>`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import listOpenTargetsFixture from '../../../../docs/ipc/fixtures/files-list-open-targets.json';
import openInTargetFixture from '../../../../docs/ipc/fixtures/files-open-in-target.json';
import type {
  OpenInTargetRequestDto,
  OpenTargetAvailabilityDto
} from './open-target.contracts';
import { listOpenTargets, openInTarget } from './open-target-client';

const ipcInvoke = vi.hoisted(() => vi.fn());

vi.mock('@/shared/ipc/client', () => ({ ipcInvoke }));

const expectedAvailability: OpenTargetAvailabilityDto[] = [
  { target: 'editor', isInstalled: true },
  { target: 'reveal_in_file_manager', isInstalled: true }
];

const expectedOpenRequest: OpenInTargetRequestDto = {
  projectId: 'proj-design-system',
  target: 'editor',
  path: 'src/App.tsx'
};

beforeEach(() => {
  ipcInvoke.mockReset();
});

describe('open target fixtures', () => {
  it('match the typed availability report and open request', () => {
    expect(listOpenTargetsFixture.response).toEqual(expectedAvailability);
    expect(openInTargetFixture.request).toEqual(expectedOpenRequest);
    expect(openInTargetFixture.response).toBeNull();
  });

  it('reports availability without a request envelope', () => {
    expect(listOpenTargetsFixture).not.toHaveProperty('request');
  });

  it('keeps the open request project-scoped and workspace-relative', () => {
    expect(openInTargetFixture.request).not.toHaveProperty('runId');
    expect(openInTargetFixture.request.path.startsWith('/')).toBe(false);
  });
});

describe('open target client', () => {
  it('calls list_open_targets with no arguments', async () => {
    ipcInvoke.mockResolvedValue(expectedAvailability);
    await expect(listOpenTargets()).resolves.toEqual(expectedAvailability);
    expect(ipcInvoke).toHaveBeenCalledWith('list_open_targets');
  });

  it('calls open_in_target with the project, target and path envelope', async () => {
    ipcInvoke.mockResolvedValue(null);
    await expect(
      openInTarget('proj-design-system', 'editor', 'src/App.tsx')
    ).resolves.toBeUndefined();
    expect(ipcInvoke).toHaveBeenCalledWith('open_in_target', {
      request: expectedOpenRequest
    });
  });
});
