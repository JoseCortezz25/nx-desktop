/**
 * Repository tests for the IPC-backed `Abrir` targets (issue #24).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import listFixture from '../../../../docs/ipc/fixtures/files-list-open-targets.json';
import openFixture from '../../../../docs/ipc/fixtures/files-open-in-target.json';
import validationFailed from '../../../../docs/ipc/fixtures/app-error-validation-failed.json';
import type { OpenTarget } from '@/shared/domain/open-target.types';
import { createIpcOpenTargetRepository } from './ipc-open-target-repository';

const listOpenTargets = vi.hoisted(() => vi.fn());
const openInTarget = vi.hoisted(() => vi.fn());

vi.mock('./open-target-client', () => ({ listOpenTargets, openInTarget }));

beforeEach(() => {
  listOpenTargets.mockReset();
  openInTarget.mockReset();
});

describe('createIpcOpenTargetRepository', () => {
  it('maps the machine report to domain availabilities', async () => {
    listOpenTargets.mockResolvedValue(listFixture.response);

    const report = await createIpcOpenTargetRepository().listOpenTargets();

    expect(report).toEqual(
      listFixture.response.map(row => ({
        target: row.target,
        isInstalled: row.isInstalled
      }))
    );
    expect(report[0]).not.toBe(listFixture.response[0]);
  });

  it('delegates the project-scoped open intent', async () => {
    openInTarget.mockResolvedValue(undefined);
    const { projectId, target, path } = openFixture.request;

    await createIpcOpenTargetRepository().openInTarget(
      projectId,
      target as OpenTarget,
      path
    );

    expect(openInTarget).toHaveBeenCalledWith(projectId, target, path);
  });

  it('propagates a rejected launch', async () => {
    openInTarget.mockRejectedValue(validationFailed);

    await expect(
      createIpcOpenTargetRepository().openInTarget(
        'proj-design-system',
        'editor',
        'src/App.tsx'
      )
    ).rejects.toEqual(validationFailed);
  });
});
