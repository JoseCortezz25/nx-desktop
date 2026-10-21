/**
 * Adapter tests for the IPC-backed folder picker (#147).
 *
 * The client is mocked at its boundary; the tests pin the mapping of a chosen
 * folder and that a cancelled dialog yields no folder.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createIpcWorkspaceFolderPicker } from './ipc-workspace-folder-picker';

const pickWorkspaceFolder = vi.hoisted(() => vi.fn());

vi.mock('./project-client', () => ({ pickWorkspaceFolder }));

beforeEach(() => {
  pickWorkspaceFolder.mockReset();
});

describe('createIpcWorkspaceFolderPicker', () => {
  it('maps the chosen folder to a source folder keyed by its path', async () => {
    pickWorkspaceFolder.mockResolvedValue({
      path: '/workspace/docs-site',
      label: 'docs-site'
    });

    await expect(
      createIpcWorkspaceFolderPicker().pickFolder()
    ).resolves.toEqual({
      id: '/workspace/docs-site',
      label: 'docs-site',
      path: '/workspace/docs-site'
    });
    expect(pickWorkspaceFolder).toHaveBeenCalledTimes(1);
  });

  it('yields no folder when the dialog is cancelled', async () => {
    pickWorkspaceFolder.mockResolvedValue(null);

    await expect(
      createIpcWorkspaceFolderPicker().pickFolder()
    ).resolves.toBeNull();
  });

  it('propagates a rejected pick instead of inventing a folder', async () => {
    pickWorkspaceFolder.mockRejectedValue({ code: 'validation_failed' });

    await expect(createIpcWorkspaceFolderPicker().pickFolder()).rejects.toEqual(
      { code: 'validation_failed' }
    );
  });
});
