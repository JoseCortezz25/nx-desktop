/**
 * Hook tests for `useWorkspaceDiff` (issue #24): the change set is read for the
 * active project, failures are normalized, and a late answer for a previous
 * project never renders as the current workspace.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiffFile } from '@/shared/domain/diff-file.types';
import {
  flushPromises,
  renderHook,
  type Deferred
} from '@/shared/testing/hook-runner';
import { useWorkspaceDiff } from './use-workspace-diff';

vi.mock('react', async () => {
  const { reactHookMock } = await import('@/shared/testing/hook-runner');
  return reactHookMock;
});

const reads = vi.hoisted(() => ({
  projectIds: [] as string[],
  pending: [] as Deferred<readonly DiffFile[]>[]
}));

vi.mock('../api/ipc-diff-repository', async () => {
  const { createDeferred } = await import('@/shared/testing/hook-runner');
  return {
    createIpcDiffRepository: (projectId: string) => ({
      readWorkspaceDiff: () => {
        reads.projectIds.push(projectId);
        const next = createDeferred<readonly DiffFile[]>();
        reads.pending.push(next);
        return next.promise;
      }
    })
  };
});

const changeSet: readonly DiffFile[] = [
  {
    path: 'src/App.tsx',
    addedCount: 1,
    removedCount: 0,
    hunks: [
      {
        header: '@@ -1,1 +1,2 @@',
        lines: [{ kind: 'added', content: 'export {};' }]
      }
    ]
  }
];

beforeEach(() => {
  reads.projectIds = [];
  reads.pending = [];
});

describe('useWorkspaceDiff', () => {
  it('reads nothing without a project', () => {
    const hook = renderHook(useWorkspaceDiff, null);

    expect(reads.projectIds).toEqual([]);
    expect(hook.result()).toEqual({
      files: null,
      isLoading: false,
      error: null
    });
  });

  it('loads the real change set of the active project', async () => {
    const hook = renderHook(useWorkspaceDiff, 'proj-a');
    expect(hook.result().isLoading).toBe(true);

    reads.pending[0].resolve(changeSet);
    await flushPromises();
    hook.rerender();

    expect(reads.projectIds).toEqual(['proj-a']);
    expect(hook.result()).toEqual({
      files: changeSet,
      isLoading: false,
      error: null
    });
  });

  it('keeps a clean workspace distinct from a failed read', async () => {
    const hook = renderHook(useWorkspaceDiff, 'proj-a');
    reads.pending[0].resolve([]);
    await flushPromises();
    hook.rerender();
    expect(hook.result().files).toEqual([]);
    expect(hook.result().error).toBeNull();

    hook.rerender('proj-b');
    reads.pending[1].reject({
      code: 'permission_denied',
      message: 'unknown project',
      retryable: false,
      requestId: 'req-3'
    });
    await flushPromises();
    hook.rerender();
    expect(hook.result().files).toBeNull();
    expect(hook.result().error?.code).toBe('permission_denied');
  });

  it('ignores a late answer for a previous project', async () => {
    const hook = renderHook(useWorkspaceDiff, 'proj-a');
    hook.rerender('proj-b');

    reads.pending[0].resolve(changeSet);
    await flushPromises();
    hook.rerender();
    expect(hook.result().isLoading).toBe(true);
    expect(hook.result().files).toBeNull();

    reads.pending[1].resolve([]);
    await flushPromises();
    hook.rerender();
    expect(hook.result().files).toEqual([]);
  });
});
