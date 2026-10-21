/**
 * Tests for the IPC-backed run repository and the `startRunStream`
 * subscription (issue #23). The Tauri transport is stubbed: `invoke` records
 * the command, and the channel stub lets the test push frames the way the core
 * would.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunStreamEventDto } from './run.contracts';

const transport = vi.hoisted(() => {
  class ChannelStub {
    onmessage: (message: unknown) => void = () => undefined;
  }
  return {
    ChannelStub,
    invoke: vi.fn(),
    lastChannel: null as { onmessage: (message: unknown) => void } | null
  };
});

vi.mock('@tauri-apps/api/core', () => ({
  Channel: transport.ChannelStub,
  invoke: transport.invoke
}));

import type { RunFrame, StartRunInput } from '../model/live-run';
import { createIpcRunRepository, toRunFrame } from './ipc-run-repository';
import { startRunStream } from './run-client';

const input: StartRunInput = {
  conversationId: 'conv-1',
  projectId: 'proj-1',
  providerId: 'opencode',
  modelId: 'model-1',
  effortLevel: 'high',
  prompt: 'Explain the selection chain.',
  environment: {
    useNewWorktree: false,
    gitBranch: 'main',
    environmentName: 'local'
  }
};

beforeEach(() => {
  transport.invoke.mockReset();
  transport.invoke.mockImplementation(
    (command: string, args: { onEvent?: { onmessage: () => void } }) => {
      if (command === 'start_run' && args.onEvent) {
        transport.lastChannel = args.onEvent;
      }
      return Promise.resolve({
        runId: 'run-1',
        conversationId: 'conv-1',
        projectId: 'proj-1',
        status: command === 'cancel_run' ? 'cancelled' : 'pending'
      });
    }
  );
  transport.lastChannel = null;
});

describe('startRunStream', () => {
  it('delivers frames until unsubscribed, and unsubscribes idempotently', () => {
    const frames: RunStreamEventDto[] = [];
    const subscription = startRunStream(
      {
        ...input,
        environment: { ...input.environment }
      },
      frame => frames.push(frame)
    );
    const channel = transport.lastChannel;
    expect(channel).not.toBeNull();

    channel?.onmessage({ kind: 'started', runId: 'run-1', seq: 1 });
    expect(frames).toHaveLength(1);

    const handlerBefore = channel?.onmessage;
    subscription.unsubscribe();
    const handlerAfter = channel?.onmessage;
    subscription.unsubscribe();

    expect(handlerAfter).not.toBe(handlerBefore);
    expect(channel?.onmessage).toBe(handlerAfter);
    handlerBefore?.({ kind: 'completed', runId: 'run-1', seq: 2 });
    channel?.onmessage({ kind: 'completed', runId: 'run-1', seq: 2 });
    expect(frames).toHaveLength(1);
  });
});

describe('createIpcRunRepository', () => {
  it('starts the run with the request envelope and the pre-bound channel', async () => {
    const repository = createIpcRunRepository();
    const frames: RunFrame[] = [];
    const subscription = repository.startRun(input, frame =>
      frames.push(frame)
    );

    await expect(subscription.runId).resolves.toBe('run-1');
    expect(transport.invoke).toHaveBeenCalledWith('start_run', {
      request: {
        conversationId: 'conv-1',
        projectId: 'proj-1',
        providerId: 'opencode',
        modelId: 'model-1',
        effortLevel: 'high',
        prompt: 'Explain the selection chain.',
        environment: {
          useNewWorktree: false,
          gitBranch: 'main',
          environmentName: 'local'
        }
      },
      onEvent: transport.lastChannel
    });

    transport.lastChannel?.onmessage({
      kind: 'textDelta',
      runId: 'run-1',
      seq: 2,
      text: 'Hello'
    });
    expect(frames).toEqual([
      { kind: 'textDelta', runId: 'run-1', seq: 2, text: 'Hello' }
    ]);
  });

  it('cancels by run id and resolves the authoritative status', async () => {
    const repository = createIpcRunRepository();
    await expect(repository.cancelRun('run-1')).resolves.toBe('cancelled');
    expect(transport.invoke).toHaveBeenCalledWith('cancel_run', {
      request: { runId: 'run-1' }
    });
  });
});

describe('toRunFrame', () => {
  it('maps every wire kind to its domain frame', () => {
    const error = {
      code: 'provider_unavailable' as const,
      message: 'down',
      retryable: true,
      requestId: 'req-1'
    };
    expect(toRunFrame({ kind: 'started', runId: 'r', seq: 1 })).toEqual({
      kind: 'started',
      runId: 'r',
      seq: 1
    });
    expect(
      toRunFrame({
        kind: 'toolActivity',
        runId: 'r',
        seq: 2,
        toolCall: {
          id: 'tool-1',
          kind: 'search',
          summary: 'Searched',
          detail: 'Matched',
          status: 'completed'
        }
      })
    ).toEqual({
      kind: 'toolActivity',
      runId: 'r',
      seq: 2,
      toolCall: {
        id: 'tool-1',
        kind: 'search',
        summary: 'Searched',
        detail: 'Matched',
        status: 'completed',
        subagentId: undefined
      }
    });
    expect(toRunFrame({ kind: 'failed', runId: 'r', seq: 3, error })).toEqual({
      kind: 'failed',
      runId: 'r',
      seq: 3,
      error
    });
    expect(toRunFrame({ kind: 'cancelled', runId: 'r', seq: 4 }).kind).toBe(
      'cancelled'
    );
    expect(toRunFrame({ kind: 'completed', runId: 'r', seq: 5 }).kind).toBe(
      'completed'
    );
  });
});
