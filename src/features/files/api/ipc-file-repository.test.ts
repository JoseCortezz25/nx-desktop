/**
 * Repository tests for the IPC-backed workspace file reads (issue #24).
 *
 * The client module is mocked at its boundary; the tests pin the project-scoped
 * delegation, the DTO → domain mapping (using the shared wire fixture), the
 * `null` passthrough for a path with no document, and that a normalized
 * `AppErrorDto` reaches the hook unchanged.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import readFileFixture from '../../../../docs/ipc/fixtures/workspace-read-file.json';
import permissionDenied from '../../../../docs/ipc/fixtures/app-error-permission-denied.json';
import { createIpcFileRepository } from './ipc-file-repository';

const readFile = vi.hoisted(() => vi.fn());

vi.mock('@/features/projects/api/workspace-client', () => ({ readFile }));

beforeEach(() => {
  readFile.mockReset();
});

describe('createIpcFileRepository', () => {
  it('reads through the bound project and maps the document', async () => {
    readFile.mockResolvedValue(readFileFixture.response);

    const document = await createIpcFileRepository(
      readFileFixture.request.projectId
    ).readDocument(readFileFixture.request.path);

    expect(readFile).toHaveBeenCalledWith(
      readFileFixture.request.projectId,
      readFileFixture.request.path
    );
    expect(document).toEqual({
      path: readFileFixture.response.path,
      content: readFileFixture.response.content
    });
    expect(document).not.toBe(readFileFixture.response);
  });

  it('resolves null when the path holds no document', async () => {
    readFile.mockResolvedValue(null);

    await expect(
      createIpcFileRepository('proj-design-system').readDocument('src/gone.ts')
    ).resolves.toBeNull();
  });

  it('propagates the normalized error the client rejected with', async () => {
    readFile.mockRejectedValue(permissionDenied);

    await expect(
      createIpcFileRepository('proj-design-system').readDocument('../secret')
    ).rejects.toEqual(permissionDenied);
  });
});
