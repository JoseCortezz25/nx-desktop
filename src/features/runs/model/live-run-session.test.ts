/**
 * Lifecycle tests for the live-run session (issue #23), driven through an
 * in-memory `RunRepository` fake: streaming renders incrementally, cancel works
 * mid-stream, the subscription is released exactly once, and frames that
 * arrive after release are ignored.
 */
import { describe, expect, it, vi } from 'vitest';
import type { RunRepository } from '../api/run-repository';
import type { LiveRunStatus, RunFrame, StartRunInput } from './live-run';
import { createLiveRunSession, type LiveRunSnapshot } from './live-run-session';

const input: StartRunInput = {
  conversationId: 'conv-1',
  projectId: 'proj-1',
  providerId: 'opencode',
  modelId: 'model-1',
  effortLevel: 'high',
  prompt: 'Explain the selection chain.',
  environment: { useNewWorktree: false, gitBranch: 'main', environmentName: '' }
};

interface FakeRun {
  emit(frame: RunFrame): void;
  resolveRunId(runId: string): void;
  rejectStart(error: unknown): void;
  readonly unsubscribe: ReturnType<typeof vi.fn>;
}

function createFakeRepository() {
  const runs: FakeRun[] = [];
  const cancelRun = vi.fn<(runId: string) => Promise<LiveRunStatus>>(() =>
    Promise.resolve('cancelled')
  );
  const repository: RunRepository = {
    startRun(_request, onFrame) {
      let resolveRunId: (runId: string) => void = () => undefined;
      let rejectStart: (error: unknown) => void = () => undefined;
      const runId = new Promise<string>((resolve, reject) => {
        resolveRunId = resolve;
        rejectStart = reject;
      });
      const unsubscribe = vi.fn();
      runs.push({
        emit: onFrame,
        resolveRunId,
        rejectStart,
        unsubscribe
      });
      return { runId, unsubscribe };
    },
    cancelRun
  };
  return { repository, runs, cancelRun };
}

function setup() {
  const fake = createFakeRepository();
  const snapshots: LiveRunSnapshot[] = [];
  const session = createLiveRunSession({
    repository: fake.repository,
    onChange: snapshot => snapshots.push(snapshot),
    now: () => '2026-10-20T10:00:00.000Z'
  });
  const latest = () => snapshots[snapshots.length - 1];
  return { ...fake, session, snapshots, latest };
}

function flush() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('live-run session streaming', () => {
  it('renders deltas incrementally and releases the stream on completion', async () => {
    const { session, runs, latest } = setup();
    expect(session.start(input)).toBe(true);
    expect(latest()?.isRunning).toBe(true);
    expect(latest()?.turns[0]?.status).toBe('pending');

    const run = runs[0];
    run?.emit({ kind: 'started', runId: 'run-1', seq: 1 });
    run?.emit({ kind: 'textDelta', runId: 'run-1', seq: 2, text: 'Model ' });
    expect(latest()?.turns[0]?.text).toBe('Model ');
    run?.emit({ kind: 'textDelta', runId: 'run-1', seq: 3, text: 'ids' });
    expect(latest()?.turns[0]?.text).toBe('Model ids');

    run?.emit({ kind: 'completed', runId: 'run-1', seq: 4 });
    expect(latest()?.turns[0]?.status).toBe('completed');
    expect(latest()?.isRunning).toBe(false);
    expect(run?.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('refuses a second send while a run streams', () => {
    const { session, runs } = setup();
    session.start(input);
    expect(session.start(input)).toBe(false);
    expect(runs).toHaveLength(1);
  });

  it('fails the turn when start_run rejects and releases the stream once', async () => {
    const { session, runs, latest } = setup();
    session.start(input);
    runs[0]?.rejectStart({
      code: 'validation_failed',
      message: 'empty branch',
      retryable: false,
      requestId: 'req-1'
    });
    await flush();
    expect(latest()?.turns[0]?.status).toBe('failed');
    expect(latest()?.turns[0]?.error?.code).toBe('validation_failed');
    expect(latest()?.isRunning).toBe(false);
    expect(runs[0]?.unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('live-run session cancel', () => {
  it('cancels mid-stream and ends in the cancelled state from the stream', async () => {
    const { session, runs, latest, cancelRun } = setup();
    session.start(input);
    const run = runs[0];
    run?.emit({ kind: 'started', runId: 'run-1', seq: 1 });
    run?.emit({ kind: 'textDelta', runId: 'run-1', seq: 2, text: 'partial' });

    session.cancel();
    session.cancel();
    expect(cancelRun).toHaveBeenCalledTimes(1);
    expect(cancelRun).toHaveBeenCalledWith('run-1');

    run?.emit({ kind: 'cancelled', runId: 'run-1', seq: 3 });
    expect(latest()?.turns[0]?.status).toBe('cancelled');
    expect(latest()?.turns[0]?.text).toBe('partial');
    expect(latest()?.isRunning).toBe(false);
    expect(run?.unsubscribe).toHaveBeenCalledTimes(1);

    // A late frame after the terminal one changes nothing.
    const count = latest();
    run?.emit({ kind: 'textDelta', runId: 'run-1', seq: 4, text: 'late' });
    expect(latest()).toBe(count);
    await flush();
    expect(run?.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('defers a cancel issued before the run id is known', async () => {
    const { session, runs, cancelRun } = setup();
    session.start(input);
    session.cancel();
    expect(cancelRun).not.toHaveBeenCalled();

    runs[0]?.resolveRunId('run-1');
    await flush();
    expect(cancelRun).toHaveBeenCalledWith('run-1');
  });

  it('settles the turn from the cancel reply when no terminal frame arrives', async () => {
    const { session, runs, latest } = setup();
    session.start(input);
    runs[0]?.emit({ kind: 'started', runId: 'run-1', seq: 1 });
    session.cancel();
    await flush();
    expect(latest()?.turns[0]?.status).toBe('cancelled');
    expect(runs[0]?.unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('live-run session dispose', () => {
  it('unsubscribes exactly once even when disposed twice', () => {
    const { session, runs } = setup();
    session.start(input);
    session.dispose();
    session.dispose();
    expect(runs[0]?.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('does not unsubscribe again on dispose after the terminal frame', () => {
    const { session, runs } = setup();
    session.start(input);
    runs[0]?.emit({ kind: 'completed', runId: 'run-1', seq: 1 });
    session.dispose();
    expect(runs[0]?.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('ignores frames, replies and starts after dispose', async () => {
    const { session, runs, snapshots, cancelRun } = setup();
    session.start(input);
    const before = snapshots.length;
    session.dispose();

    runs[0]?.emit({ kind: 'textDelta', runId: 'run-1', seq: 1, text: 'late' });
    runs[0]?.resolveRunId('run-1');
    session.cancel();
    await flush();

    expect(snapshots).toHaveLength(before);
    expect(cancelRun).not.toHaveBeenCalled();
    expect(session.start(input)).toBe(false);
  });

  it('ignores frames of a finished turn after a new run starts', () => {
    const { session, runs, latest } = setup();
    session.start(input);
    runs[0]?.emit({ kind: 'completed', runId: 'run-1', seq: 1 });
    session.start(input);
    runs[0]?.emit({ kind: 'textDelta', runId: 'run-1', seq: 2, text: 'old' });
    expect(latest()?.turns.map(turn => turn.text)).toEqual(['', '']);
  });
});
