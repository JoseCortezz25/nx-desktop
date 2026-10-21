/**
 * Hook tests for `useHookReview` (issue #24).
 *
 * The list is read for the active project, every decision goes through
 * `set_hook_decision` and the list then shows exactly the hooks the core
 * returned — never an optimistic status. Late answers for a previous project
 * are neither rendered nor merged.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Hook, HookApprovalStatus } from '@/shared/domain/hook.types';
import {
  flushPromises,
  renderHook,
  type Deferred
} from '@/shared/testing/hook-runner';
import { useHookReview } from './use-hook-review';

vi.mock('react', async () => {
  const { reactHookMock } = await import('@/shared/testing/hook-runner');
  return reactHookMock;
});

interface DecisionCall {
  readonly projectId: string;
  readonly hookId: string;
  readonly approvalStatus: HookApprovalStatus;
  readonly result: Deferred<Hook>;
}

const port = vi.hoisted(() => ({
  lists: [] as { projectId: string; result: Deferred<readonly Hook[]> }[],
  decisions: [] as DecisionCall[]
}));

vi.mock('../api/ipc-hook-repository', async () => {
  const { createDeferred } = await import('@/shared/testing/hook-runner');
  return {
    createIpcHookRepository: (projectId: string) => ({
      listHooks: () => {
        const result = createDeferred<readonly Hook[]>();
        port.lists.push({ projectId, result });
        return result.promise;
      },
      setHookDecision: (hookId: string, approvalStatus: HookApprovalStatus) => {
        const result = createDeferred<Hook>();
        port.decisions.push({ projectId, hookId, approvalStatus, result });
        return result.promise;
      }
    })
  };
});

function hook(
  id: string,
  approvalStatus: HookApprovalStatus = 'pending'
): Hook {
  return {
    id,
    name: `Check ${id}`,
    isNew: true,
    origin: 'Project configuration',
    hookType: 'PreToolUse',
    command: 'pnpm lint',
    timeoutMs: 5000,
    approvalStatus
  };
}

const listed: readonly Hook[] = [hook('hook-a'), hook('hook-b')];

async function mountLoaded(projectId = 'proj-a') {
  const rendered = renderHook(useHookReview, projectId);
  port.lists[port.lists.length - 1].result.resolve(listed);
  await flushPromises();
  rendered.rerender();
  return rendered;
}

beforeEach(() => {
  port.lists = [];
  port.decisions = [];
});

describe('useHookReview', () => {
  it('lists no hooks and reads nothing without a project', () => {
    const rendered = renderHook(useHookReview, null);

    expect(port.lists).toEqual([]);
    expect(rendered.result().hooks).toEqual([]);
    expect(rendered.result().isLoading).toBe(false);
  });

  it('starts loading and then lists the real hooks of the project', async () => {
    const rendered = renderHook(useHookReview, 'proj-a');
    expect(rendered.result().hooks).toBeNull();
    expect(rendered.result().isLoading).toBe(true);

    port.lists[0].result.resolve(listed);
    await flushPromises();
    rendered.rerender();

    expect(port.lists[0].projectId).toBe('proj-a');
    expect(rendered.result().hooks).toEqual(listed);
    expect(rendered.result().isLoading).toBe(false);
    expect(rendered.result().loadError).toBeNull();
  });

  it('normalizes a failed list read', async () => {
    const rendered = renderHook(useHookReview, 'proj-a');

    port.lists[0].result.reject(new Error('bridge down'));
    await flushPromises();
    rendered.rerender();

    expect(rendered.result().hooks).toBeNull();
    expect(rendered.result().isLoading).toBe(false);
    expect(rendered.result().loadError?.code).toBe('internal_error');
  });

  it('ignores a late list for a project the user switched away from', async () => {
    const rendered = renderHook(useHookReview, 'proj-a');
    rendered.rerender('proj-b');

    port.lists[0].result.resolve([hook('hook-stale')]);
    await flushPromises();
    rendered.rerender();
    expect(rendered.result().hooks).toBeNull();
    expect(rendered.result().isLoading).toBe(true);

    port.lists[1].result.resolve(listed);
    await flushPromises();
    rendered.rerender();
    expect(rendered.result().hooks).toEqual(listed);
  });

  it('writes each decision and renders the status the core stored', async () => {
    const rendered = await mountLoaded();

    const decided = rendered
      .result()
      .decideHooks(['hook-a', 'hook-b'], 'rejected');
    rendered.rerender();

    expect(rendered.result().isDeciding).toBe(true);
    // Nothing optimistic: the list is unchanged until the core answers.
    expect(rendered.result().hooks).toEqual(listed);
    expect(
      port.decisions.map(call => [
        call.projectId,
        call.hookId,
        call.approvalStatus
      ])
    ).toEqual([
      ['proj-a', 'hook-a', 'rejected'],
      ['proj-a', 'hook-b', 'rejected']
    ]);

    port.decisions[0].result.resolve(hook('hook-a', 'rejected'));
    port.decisions[1].result.resolve(hook('hook-b', 'rejected'));
    await expect(decided).resolves.toBe(true);
    rendered.rerender();

    expect(rendered.result().isDeciding).toBe(false);
    expect(rendered.result().decisionError).toBeNull();
    expect(rendered.result().hooks?.map(item => item.approvalStatus)).toEqual([
      'rejected',
      'rejected'
    ]);
  });

  it('reflects the stored status even when it differs from the one sent', async () => {
    const rendered = await mountLoaded();

    const decided = rendered.result().decideHooks(['hook-a'], 'approved');
    port.decisions[0].result.resolve(hook('hook-a', 'pending'));
    await decided;
    rendered.rerender();

    expect(rendered.result().hooks?.[0].approvalStatus).toBe('pending');
  });

  it('keeps what was stored and reports a partial failure', async () => {
    const rendered = await mountLoaded();

    const decided = rendered
      .result()
      .decideHooks(['hook-a', 'hook-b'], 'approved');
    port.decisions[0].result.resolve(hook('hook-a', 'approved'));
    port.decisions[1].result.reject({
      code: 'validation_failed',
      message: 'unknown hook',
      retryable: false,
      requestId: 'req-9'
    });
    await expect(decided).resolves.toBe(false);
    rendered.rerender();

    expect(rendered.result().decisionError?.code).toBe('validation_failed');
    expect(rendered.result().hooks?.map(item => item.approvalStatus)).toEqual([
      'approved',
      'pending'
    ]);
  });

  it('never merges a decision answer into another project list', async () => {
    const rendered = await mountLoaded('proj-a');
    const decided = rendered.result().decideHooks(['hook-a'], 'approved');

    rendered.rerender('proj-b');
    port.lists[1].result.resolve([hook('hook-a')]);
    await flushPromises();
    rendered.rerender();

    port.decisions[0].result.resolve(hook('hook-a', 'approved'));
    await decided;
    rendered.rerender();

    expect(rendered.result().hooks?.[0].approvalStatus).toBe('pending');
    expect(rendered.result().isDeciding).toBe(false);
  });

  it('resolves without writing for an empty decision or no project', async () => {
    const rendered = await mountLoaded();
    await expect(rendered.result().decideHooks([], 'approved')).resolves.toBe(
      true
    );

    rendered.rerender(null);
    await expect(
      rendered.result().decideHooks(['hook-a'], 'approved')
    ).resolves.toBe(false);
    expect(port.decisions).toEqual([]);
  });
});
