/**
 * Contract and client tests for runs and the run stream (issue #16, slice 3).
 *
 * The fixtures are the same JSON the Rust suite reads, so a field rename, a
 * drifted enum value or a seventh stream kind fails on both sides. The typed
 * literals pin the TypeScript view; the client tests pin the command names, the
 * `{ request }` envelopes and the pre-bound `onEvent` channel. The exhaustive
 * `switch` fails the build if the union gains or loses a kind.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import cancelRunFixture from '../../../../docs/ipc/fixtures/runs-cancel-run.json';
import getRunFixture from '../../../../docs/ipc/fixtures/runs-get-run.json';
import startRunFixture from '../../../../docs/ipc/fixtures/runs-start-run.json';
import streamEventsFixture from '../../../../docs/ipc/fixtures/runs-stream-events.json';
import { Channel } from '@tauri-apps/api/core';
import type {
  RunDto,
  RunEnvironmentDto,
  RunStreamEventDto,
  RunStreamEventKind,
  StartRunRequestDto
} from './run.contracts';
import { RUN_STREAM_EVENT_KINDS } from './run.contracts';
import { cancelRun, getRun, startRun } from './run-client';

const ipcInvoke = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => {
  class ChannelStub {
    onmessage: ((message: unknown) => void) | null = null;
  }
  return { Channel: ChannelStub, invoke: vi.fn() };
});

vi.mock('@/shared/ipc/client', () => ({ ipcInvoke }));

const expectedEnvironment: RunEnvironmentDto = {
  useNewWorktree: false,
  gitBranch: 'main',
  environmentName: 'local'
};

const expectedStartRequest: StartRunRequestDto = {
  conversationId: 'conv-composer-chain',
  projectId: 'proj-design-system',
  providerId: 'opencode',
  modelId: 'deepseek-v3.1',
  effortLevel: 'high',
  prompt: 'Reconcile the provider, model, and effort selectors.',
  environment: expectedEnvironment
};

const pendingRun: RunDto = {
  runId: 'run-7f2a9c10',
  conversationId: 'conv-composer-chain',
  projectId: 'proj-design-system',
  status: 'pending'
};

const streamingRun: RunDto = { ...pendingRun, status: 'streaming' };

const cancelledRun: RunDto = { ...pendingRun, status: 'cancelled' };

const expectedStreamEvents: Record<RunStreamEventKind, RunStreamEventDto> = {
  started: { kind: 'started', runId: 'run-7f2a9c10', seq: 1 },
  textDelta: {
    kind: 'textDelta',
    runId: 'run-7f2a9c10',
    seq: 2,
    text: 'Reconciling the provider, model, and effort selectors.'
  },
  toolActivity: {
    kind: 'toolActivity',
    runId: 'run-7f2a9c10',
    seq: 3,
    toolCall: {
      id: 'tool-run-1',
      kind: 'search',
      summary: 'Searched src for the selection chain',
      detail: 'Matched selection-chain.ts and the composer organisms.',
      status: 'completed'
    }
  },
  completed: { kind: 'completed', runId: 'run-7f2a9c10', seq: 4 },
  failed: {
    kind: 'failed',
    runId: 'run-7f2a9c10',
    seq: 5,
    error: {
      code: 'provider_unavailable',
      message: 'provider adapter did not respond before the timeout',
      retryable: true,
      requestId: 'req-6c02f7a1'
    }
  },
  cancelled: { kind: 'cancelled', runId: 'run-7f2a9c10', seq: 5 }
};

/** Fails at compile time when a union member has no case. */
function assertNever(value: never): never {
  throw new Error(`unhandled run stream kind: ${JSON.stringify(value)}`);
}

/** Reads a variant-specific value, proving the switch is exhaustive. */
function frameDetail(event: RunStreamEventDto): string {
  switch (event.kind) {
    case 'started':
      return `started@${event.seq}`;
    case 'textDelta':
      return `text:${event.text}`;
    case 'toolActivity':
      return `tool:${event.toolCall.id}`;
    case 'completed':
      return 'completed';
    case 'failed':
      return `failed:${event.error.code}`;
    case 'cancelled':
      return 'cancelled';
    default:
      return assertNever(event);
  }
}

beforeEach(() => {
  ipcInvoke.mockReset();
});

describe('run fixtures', () => {
  it('match the typed start request and initial snapshot', () => {
    expect(startRunFixture.request).toEqual(expectedStartRequest);
    expect(startRunFixture.response).toEqual(pendingRun);
  });

  it('match the cancel and snapshot envelopes', () => {
    expect(cancelRunFixture.request).toEqual({ runId: 'run-7f2a9c10' });
    expect(cancelRunFixture.response).toEqual(cancelledRun);
    expect(getRunFixture.request).toEqual({ runId: 'run-7f2a9c10' });
    expect(getRunFixture.response).toEqual(streamingRun);
  });

  it('start_run carries no approvalMode', () => {
    expect(startRunFixture.request).not.toHaveProperty('approvalMode');
  });
});

describe('run stream fixture', () => {
  it('holds exactly one canonical frame per kind', () => {
    expect(Object.keys(streamEventsFixture.events).sort()).toEqual(
      [...RUN_STREAM_EVENT_KINDS].sort()
    );
    expect(streamEventsFixture.events).toEqual(expectedStreamEvents);
  });

  it('tags every frame with a runId and a monotonic seq', () => {
    const events = RUN_STREAM_EVENT_KINDS.map(
      kind => expectedStreamEvents[kind]
    );
    for (const event of events) {
      expect(typeof event.runId).toBe('string');
      expect(Number.isInteger(event.seq)).toBe(true);
    }
  });

  it('is exhaustively handled by the union switch', () => {
    expect(
      RUN_STREAM_EVENT_KINDS.map(kind =>
        frameDetail(expectedStreamEvents[kind])
      )
    ).toEqual([
      'started@1',
      'text:Reconciling the provider, model, and effort selectors.',
      'tool:tool-run-1',
      'completed',
      'failed:provider_unavailable',
      'cancelled'
    ]);
  });
});

describe('run client', () => {
  it('calls start_run with the request and an already-bound channel', async () => {
    ipcInvoke.mockResolvedValue(pendingRun);
    const received: RunStreamEventDto[] = [];
    const onEvent = new Channel<RunStreamEventDto>();
    onEvent.onmessage = event => received.push(event);

    await expect(startRun(expectedStartRequest, onEvent)).resolves.toEqual(
      pendingRun
    );
    expect(ipcInvoke).toHaveBeenCalledWith('start_run', {
      request: expectedStartRequest,
      onEvent
    });

    // The handler was bound before the invoke, so an early frame already lands.
    onEvent.onmessage(expectedStreamEvents.started);
    expect(received).toEqual([expectedStreamEvents.started]);
  });

  it('calls cancel_run with the run envelope', async () => {
    ipcInvoke.mockResolvedValue(cancelledRun);
    await expect(cancelRun('run-7f2a9c10')).resolves.toEqual(cancelledRun);
    expect(ipcInvoke).toHaveBeenCalledWith('cancel_run', {
      request: { runId: 'run-7f2a9c10' }
    });
  });

  it('calls get_run with the run envelope', async () => {
    ipcInvoke.mockResolvedValue(streamingRun);
    await expect(getRun('run-7f2a9c10')).resolves.toEqual(streamingRun);
    expect(ipcInvoke).toHaveBeenCalledWith('get_run', {
      request: { runId: 'run-7f2a9c10' }
    });
  });
});
