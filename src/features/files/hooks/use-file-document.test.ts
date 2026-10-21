/**
 * Hook tests for `useFileDocument` (issue #24).
 *
 * `react` is replaced by the node hook runner so the effect and its cleanup run
 * without a DOM; the IPC repository is mocked at its factory so each read's
 * settlement order is controlled by the test.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileDocument } from '@/shared/domain/file-document.types';
import {
  flushPromises,
  renderHook,
  type Deferred
} from '@/shared/testing/hook-runner';
import { useFileDocument } from './use-file-document';

vi.mock('react', async () => {
  const { reactHookMock } = await import('@/shared/testing/hook-runner');
  return reactHookMock;
});

const reads = vi.hoisted(() => ({
  calls: [] as { projectId: string; path: string }[],
  pending: [] as Deferred<FileDocument | null>[]
}));

vi.mock('../api/ipc-file-repository', async () => {
  const { createDeferred: deferred } =
    await import('@/shared/testing/hook-runner');
  return {
    createIpcFileRepository: (projectId: string) => ({
      readDocument: (path: string) => {
        reads.calls.push({ projectId, path });
        const next = deferred<FileDocument | null>();
        reads.pending.push(next);
        return next.promise;
      }
    })
  };
});

interface Props {
  readonly projectId: string | null;
  readonly path: string | null;
}

function mount(props: Props) {
  return renderHook(
    ({ projectId, path }: Props) => useFileDocument(projectId, path),
    props
  );
}

const appDocument: FileDocument = {
  path: 'src/App.tsx',
  content: 'export {};'
};

beforeEach(() => {
  reads.calls = [];
  reads.pending = [];
});

describe('useFileDocument', () => {
  it('reads nothing and is idle without a project or path', () => {
    const hook = mount({ projectId: null, path: 'src/App.tsx' });

    expect(reads.calls).toEqual([]);
    expect(hook.result()).toEqual({
      document: null,
      isLoading: false,
      error: null
    });
  });

  it('loads the real content through the bound project', async () => {
    const hook = mount({ projectId: 'proj-a', path: 'src/App.tsx' });
    expect(hook.result().isLoading).toBe(true);
    expect(reads.calls).toEqual([{ projectId: 'proj-a', path: 'src/App.tsx' }]);

    reads.pending[0].resolve(appDocument);
    await flushPromises();
    hook.rerender();

    expect(hook.result()).toEqual({
      document: appDocument,
      isLoading: false,
      error: null
    });
  });

  it('normalizes a rejected read into an AppErrorDto', async () => {
    const hook = mount({ projectId: 'proj-a', path: '../secret' });

    reads.pending[0].reject({
      code: 'permission_denied',
      message: 'path is outside the authorized workspace root',
      retryable: false,
      requestId: 'req-7'
    });
    await flushPromises();
    hook.rerender();

    expect(hook.result().document).toBeNull();
    expect(hook.result().isLoading).toBe(false);
    expect(hook.result().error?.code).toBe('permission_denied');
  });

  it('maps a non-DTO rejection to internal_error', async () => {
    const hook = mount({ projectId: 'proj-a', path: 'src/App.tsx' });

    reads.pending[0].reject(new Error('bridge down'));
    await flushPromises();
    hook.rerender();

    expect(hook.result().error?.code).toBe('internal_error');
  });

  it('ignores a late answer for a project the user switched away from', async () => {
    const hook = mount({ projectId: 'proj-a', path: 'src/App.tsx' });
    hook.rerender({ projectId: 'proj-b', path: 'src/App.tsx' });
    expect(reads.calls.map(call => call.projectId)).toEqual([
      'proj-a',
      'proj-b'
    ]);

    reads.pending[0].resolve({ path: 'src/App.tsx', content: 'stale' });
    await flushPromises();
    hook.rerender();
    expect(hook.result()).toEqual({
      document: null,
      isLoading: true,
      error: null
    });

    reads.pending[1].resolve(appDocument);
    await flushPromises();
    hook.rerender();
    expect(hook.result().document).toEqual(appDocument);
  });

  it('drops a read that settles after unmount', async () => {
    const hook = mount({ projectId: 'proj-a', path: 'src/App.tsx' });
    hook.unmount();

    reads.pending[0].resolve(appDocument);
    await flushPromises();
    hook.rerender();

    // The rerender re-subscribes, so only the second read may ever land.
    expect(hook.result().isLoading).toBe(true);
  });
});
