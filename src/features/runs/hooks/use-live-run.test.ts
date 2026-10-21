/**
 * Hook tests for `useLiveRun` (issue #23).
 *
 * The test runner has no DOM, so React's state/ref/effect primitives are
 * replaced with a tiny single-component harness (the same technique the shell
 * seam tests use). It models mount, re-render, unmount and the StrictMode
 * mount → cleanup → mount sequence; the IPC repository is replaced at its
 * boundary with an in-memory fake that counts `unsubscribe` calls.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunRepository } from '../api/run-repository';
import type { RunFrame, StartRunInput } from '../model/live-run';

const harness = vi.hoisted(() => {
  const state = {
    slots: [] as unknown[],
    cursor: 0,
    effects: [] as Array<() => void | (() => void)>,
    cleanups: [] as Array<() => void>,
    isFirstRender: true
  };
  return state;
});

vi.mock('react', () => ({
  useState<T>(initial: T) {
    const index = harness.cursor;
    harness.cursor += 1;
    if (harness.slots.length <= index) {
      harness.slots.push(initial);
    }
    const setState = (next: T) => {
      harness.slots[index] = next;
    };
    return [harness.slots[index] as T, setState];
  },
  useRef<T>(initial: T) {
    const index = harness.cursor;
    harness.cursor += 1;
    if (harness.slots.length <= index) {
      harness.slots.push({ current: initial });
    }
    return harness.slots[index] as { current: T };
  },
  useEffect(effect: () => void | (() => void)) {
    // `[]` deps: register only on the first render.
    if (harness.isFirstRender) {
      harness.effects.push(effect);
    }
  }
}));

const fake = vi.hoisted(() => ({
  runs: [] as Array<{
    emit: (frame: RunFrame) => void;
    resolveRunId: (runId: string) => void;
    unsubscribe: ReturnType<typeof vi.fn>;
  }>,
  cancelRun: vi.fn()
}));

vi.mock('../api/ipc-run-repository', () => ({
  createIpcRunRepository(): RunRepository {
    return {
      startRun(_input, onFrame) {
        let resolveRunId: (runId: string) => void = () => undefined;
        const runId = new Promise<string>(resolve => {
          resolveRunId = resolve;
        });
        const unsubscribe = vi.fn();
        fake.runs.push({ emit: onFrame, resolveRunId, unsubscribe });
        return { runId, unsubscribe };
      },
      cancelRun: fake.cancelRun
    };
  }
}));

import { useLiveRun, type LiveRunState } from './use-live-run';

const input: StartRunInput = {
  conversationId: 'conv-1',
  projectId: 'proj-1',
  providerId: 'opencode',
  modelId: 'model-1',
  effortLevel: 'high',
  prompt: 'Explain the selection chain.',
  environment: { useNewWorktree: false, gitBranch: 'main', environmentName: '' }
};

function render(): LiveRunState {
  harness.cursor = 0;
  const result = useLiveRun();
  harness.isFirstRender = false;
  return result;
}

function commitEffects() {
  for (const effect of harness.effects) {
    const cleanup = effect();
    if (cleanup) {
      harness.cleanups.push(cleanup);
    }
  }
}

function runCleanups() {
  for (const cleanup of harness.cleanups) {
    cleanup();
  }
}

function mount(): LiveRunState {
  const result = render();
  commitEffects();
  return result;
}

function flush() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

beforeEach(() => {
  harness.slots = [];
  harness.cursor = 0;
  harness.effects = [];
  harness.cleanups = [];
  harness.isFirstRender = true;
  fake.runs.length = 0;
  fake.cancelRun.mockReset();
  fake.cancelRun.mockResolvedValue('cancelled');
});

describe('useLiveRun streaming', () => {
  it('renders deltas incrementally in order', () => {
    const view = mount();
    expect(view.isRunning).toBe(false);
    expect(view.startRun(input)).toBe(true);
    expect(render().isRunning).toBe(true);

    const run = fake.runs[0];
    run?.emit({ kind: 'started', runId: 'run-1', seq: 1 });
    run?.emit({ kind: 'textDelta', runId: 'run-1', seq: 2, text: 'Model ' });
    expect(render().turns[0]?.text).toBe('Model ');
    run?.emit({ kind: 'textDelta', runId: 'run-1', seq: 3, text: 'ids' });
    expect(render().turns[0]?.text).toBe('Model ids');

    run?.emit({ kind: 'completed', runId: 'run-1', seq: 4 });
    const done = render();
    expect(done.turns[0]?.status).toBe('completed');
    expect(done.isRunning).toBe(false);
  });

  it('guards a double send while a run streams', () => {
    const view = mount();
    expect(view.startRun(input)).toBe(true);
    expect(render().startRun(input)).toBe(false);
    expect(fake.runs).toHaveLength(1);
  });
});

describe('useLiveRun cancel', () => {
  it('cancels mid-stream and ends in the cancelled state', () => {
    const view = mount();
    view.startRun(input);
    const run = fake.runs[0];
    run?.emit({ kind: 'started', runId: 'run-1', seq: 1 });
    run?.emit({ kind: 'textDelta', runId: 'run-1', seq: 2, text: 'partial' });

    render().cancelRun();
    expect(fake.cancelRun).toHaveBeenCalledTimes(1);
    expect(fake.cancelRun).toHaveBeenCalledWith('run-1');

    run?.emit({ kind: 'cancelled', runId: 'run-1', seq: 3 });
    const after = render();
    expect(after.turns[0]?.status).toBe('cancelled');
    expect(after.turns[0]?.text).toBe('partial');
    expect(after.isRunning).toBe(false);
  });
});

describe('useLiveRun cleanup', () => {
  it('unsubscribes exactly once on unmount, even when cleanup runs twice', () => {
    const view = mount();
    view.startRun(input);
    runCleanups();
    runCleanups();
    expect(fake.runs[0]?.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('does not unsubscribe again when unmounted after the terminal frame', () => {
    const view = mount();
    view.startRun(input);
    fake.runs[0]?.emit({ kind: 'completed', runId: 'run-1', seq: 1 });
    runCleanups();
    expect(fake.runs[0]?.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('does not unsubscribe again when unmounted after a cancel', () => {
    const view = mount();
    view.startRun(input);
    fake.runs[0]?.emit({ kind: 'started', runId: 'run-1', seq: 1 });
    render().cancelRun();
    fake.runs[0]?.emit({ kind: 'cancelled', runId: 'run-1', seq: 2 });
    runCleanups();
    expect(fake.runs[0]?.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('ignores frames that arrive after unmount', async () => {
    const view = mount();
    view.startRun(input);
    const before = render().turns;
    runCleanups();

    fake.runs[0]?.emit({
      kind: 'textDelta',
      runId: 'run-1',
      seq: 1,
      text: 'x'
    });
    fake.runs[0]?.resolveRunId('run-1');
    await flush();

    expect(render().turns).toBe(before);
    expect(fake.cancelRun).not.toHaveBeenCalled();
  });

  it('survives the StrictMode mount → cleanup → mount sequence', () => {
    render();
    commitEffects();
    runCleanups();
    harness.cleanups = [];
    commitEffects();

    const view = render();
    expect(view.startRun(input)).toBe(true);
    fake.runs[0]?.emit({
      kind: 'textDelta',
      runId: 'run-1',
      seq: 1,
      text: 'ok'
    });
    expect(render().turns[0]?.text).toBe('ok');

    runCleanups();
    expect(fake.runs[0]?.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
