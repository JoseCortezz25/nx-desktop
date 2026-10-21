/**
 * Hook tests for `useOpenTargets` (issue #24): the machine report is read once,
 * the open action carries the active project, and a rejected launch is only
 * reported under the project it was requested for.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  OpenTarget,
  OpenTargetAvailability
} from '@/shared/domain/open-target.types';
import {
  flushPromises,
  renderHook,
  type Deferred
} from '@/shared/testing/hook-runner';
import { useOpenTargets } from './use-open-targets';

vi.mock('react', async () => {
  const { reactHookMock } = await import('@/shared/testing/hook-runner');
  return reactHookMock;
});

const port = vi.hoisted(() => ({
  report: null as Deferred<readonly OpenTargetAvailability[]> | null,
  listCalls: 0,
  opens: [] as { projectId: string; target: OpenTarget; path: string }[],
  launches: [] as Deferred<void>[]
}));

vi.mock('../api/ipc-open-target-repository', async () => {
  const { createDeferred: deferred } =
    await import('@/shared/testing/hook-runner');
  return {
    createIpcOpenTargetRepository: () => ({
      listOpenTargets: () => {
        port.listCalls += 1;
        port.report = deferred<readonly OpenTargetAvailability[]>();
        return port.report.promise;
      },
      openInTarget: (projectId: string, target: OpenTarget, path: string) => {
        port.opens.push({ projectId, target, path });
        const launch = deferred<void>();
        port.launches.push(launch);
        return launch.promise;
      }
    })
  };
});

const REPORT: readonly OpenTargetAvailability[] = [
  { target: 'editor', isInstalled: true }
];

beforeEach(() => {
  port.report = null;
  port.listCalls = 0;
  port.opens = [];
  port.launches = [];
});

describe('useOpenTargets', () => {
  it('reads the machine report once, across project changes', async () => {
    const hook = renderHook(useOpenTargets, 'proj-a');
    expect(hook.result().isLoading).toBe(true);

    port.report?.resolve(REPORT);
    await flushPromises();
    hook.rerender('proj-b');

    expect(port.listCalls).toBe(1);
    expect(hook.result().targets).toEqual(REPORT);
    expect(hook.result().isLoading).toBe(false);
  });

  it('settles to an empty report when the probe fails', async () => {
    const hook = renderHook(useOpenTargets, 'proj-a');

    port.report?.reject({ code: 'internal_error' });
    await flushPromises();
    hook.rerender();

    expect(hook.result().targets).toEqual([]);
    expect(hook.result().isLoading).toBe(false);
  });

  it('opens within the active project and launches nothing without one', () => {
    const hook = renderHook(useOpenTargets, null);
    hook.result().openInTarget('editor', 'src/App.tsx');
    expect(port.opens).toEqual([]);

    hook.rerender('proj-a');
    hook.result().openInTarget('editor', 'src/App.tsx');
    expect(port.opens).toEqual([
      { projectId: 'proj-a', target: 'editor', path: 'src/App.tsx' }
    ]);
  });

  it('reports a rejected launch for its own project only', async () => {
    const hook = renderHook(useOpenTargets, 'proj-a');
    hook.result().openInTarget('editor', 'src/App.tsx');

    port.launches[0].reject({ code: 'validation_failed' });
    await flushPromises();
    hook.rerender();
    expect(hook.result().hasOpenFailed).toBe(true);

    hook.rerender('proj-b');
    expect(hook.result().hasOpenFailed).toBe(false);
  });

  it('ignores a late rejection once the project changed', async () => {
    const hook = renderHook(useOpenTargets, 'proj-a');
    hook.result().openInTarget('editor', 'src/App.tsx');
    hook.rerender('proj-b');
    hook.result().openInTarget('editor', 'README.md');

    port.launches[0].reject({ code: 'validation_failed' });
    await flushPromises();
    hook.rerender();

    expect(hook.result().hasOpenFailed).toBe(false);
  });
});
