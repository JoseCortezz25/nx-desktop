/**
 * Repository tests for the IPC-backed workspace diff (issue #24).
 *
 * The shared wire fixture is mapped through unchanged: file order, the core's
 * own counts and every hunk line. A clean workspace stays `[]`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import diffFixture from '../../../../docs/ipc/fixtures/diff-read-workspace-diff.json';
import internalError from '../../../../docs/ipc/fixtures/app-error-internal-error.json';
import { createIpcDiffRepository } from './ipc-diff-repository';

const readWorkspaceDiff = vi.hoisted(() => vi.fn());

vi.mock('./diff-client', () => ({ readWorkspaceDiff }));

beforeEach(() => {
  readWorkspaceDiff.mockReset();
});

describe('createIpcDiffRepository', () => {
  it('reads the bound project and maps every file, hunk and line', async () => {
    readWorkspaceDiff.mockResolvedValue(diffFixture.response);

    const files = await createIpcDiffRepository(
      diffFixture.request.projectId
    ).readWorkspaceDiff();

    expect(readWorkspaceDiff).toHaveBeenCalledWith(
      diffFixture.request.projectId
    );
    expect(files).toEqual(diffFixture.response);
    expect(files[0]).not.toBe(diffFixture.response[0]);
    expect(files.map(file => file.path)).toEqual(
      diffFixture.response.map(file => file.path)
    );
  });

  it('keeps a clean workspace as an empty list', async () => {
    readWorkspaceDiff.mockResolvedValue([]);

    await expect(
      createIpcDiffRepository('proj-design-system').readWorkspaceDiff()
    ).resolves.toEqual([]);
  });

  it('propagates the normalized error the client rejected with', async () => {
    readWorkspaceDiff.mockRejectedValue(internalError);

    await expect(
      createIpcDiffRepository('proj-design-system').readWorkspaceDiff()
    ).rejects.toEqual(internalError);
  });
});
