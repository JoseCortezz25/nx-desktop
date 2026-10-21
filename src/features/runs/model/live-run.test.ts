/**
 * Frame rules of the live-run presentation model (issue #23): incremental
 * accumulation, ordering by `seq`, stale run rejection, first terminal frame
 * wins, and the projection into the conversation's message rows.
 */
import { describe, expect, it } from 'vitest';
import type { Conversation } from '@/shared/domain/conversation.types';
import {
  appendLiveTurns,
  applyRunFrame,
  bindRunId,
  createLiveTurn,
  failLiveTurn,
  findLatestTurn,
  settleLiveTurn,
  type LiveTurn,
  type RunFrame,
  type StartRunInput
} from './live-run';

const input: StartRunInput = {
  conversationId: 'conv-1',
  projectId: 'proj-1',
  providerId: 'opencode',
  modelId: 'model-1',
  effortLevel: 'high',
  prompt: 'Explain the selection chain.',
  environment: { useNewWorktree: false, gitBranch: 'main', environmentName: '' }
};

const startedAt = '2026-10-20T10:00:00.000Z';

function applyAll(turn: LiveTurn, frames: readonly RunFrame[]): LiveTurn {
  return frames.reduce(applyRunFrame, turn);
}

const fresh = createLiveTurn('live-turn-1', input, startedAt);

describe('applyRunFrame', () => {
  it('appends text deltas incrementally and in order', () => {
    const afterStart = applyRunFrame(fresh, {
      kind: 'started',
      runId: 'run-1',
      seq: 1
    });
    expect(afterStart.status).toBe('streaming');
    expect(afterStart.runId).toBe('run-1');

    const afterFirst = applyRunFrame(afterStart, {
      kind: 'textDelta',
      runId: 'run-1',
      seq: 2,
      text: 'Model ids '
    });
    expect(afterFirst.text).toBe('Model ids ');

    const afterSecond = applyRunFrame(afterFirst, {
      kind: 'textDelta',
      runId: 'run-1',
      seq: 3,
      text: 'are provider-scoped.'
    });
    expect(afterSecond.text).toBe('Model ids are provider-scoped.');
    expect(afterSecond.lastSeq).toBe(3);
  });

  it('drops duplicate and out-of-order frames', () => {
    const turn = applyAll(fresh, [
      { kind: 'started', runId: 'run-1', seq: 1 },
      { kind: 'textDelta', runId: 'run-1', seq: 3, text: 'b' }
    ]);
    expect(
      applyRunFrame(turn, {
        kind: 'textDelta',
        runId: 'run-1',
        seq: 2,
        text: 'a'
      })
    ).toBe(turn);
    expect(
      applyRunFrame(turn, {
        kind: 'textDelta',
        runId: 'run-1',
        seq: 3,
        text: 'b'
      })
    ).toBe(turn);
  });

  it('drops frames of another run once bound', () => {
    const turn = applyRunFrame(fresh, {
      kind: 'started',
      runId: 'run-1',
      seq: 1
    });
    expect(
      applyRunFrame(turn, {
        kind: 'textDelta',
        runId: 'run-stale',
        seq: 2,
        text: 'stale'
      })
    ).toBe(turn);
  });

  it('upserts tool activity by id', () => {
    const toolCall = {
      id: 'tool-1',
      kind: 'search' as const,
      summary: 'Searched src',
      detail: '',
      status: 'running' as const
    };
    const turn = applyAll(fresh, [
      { kind: 'toolActivity', runId: 'run-1', seq: 1, toolCall },
      {
        kind: 'toolActivity',
        runId: 'run-1',
        seq: 2,
        toolCall: { ...toolCall, status: 'completed' }
      }
    ]);
    expect(turn.toolCalls).toEqual([{ ...toolCall, status: 'completed' }]);
  });

  it('keeps the first terminal frame and ignores everything after it', () => {
    const cancelled = applyAll(fresh, [
      { kind: 'started', runId: 'run-1', seq: 1 },
      { kind: 'textDelta', runId: 'run-1', seq: 2, text: 'partial' },
      { kind: 'cancelled', runId: 'run-1', seq: 3 }
    ]);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.text).toBe('partial');
    expect(
      applyRunFrame(cancelled, { kind: 'completed', runId: 'run-1', seq: 4 })
    ).toBe(cancelled);
    expect(
      applyRunFrame(cancelled, {
        kind: 'textDelta',
        runId: 'run-1',
        seq: 5,
        text: 'late'
      })
    ).toBe(cancelled);
  });

  it('carries the failure error', () => {
    const error = {
      code: 'provider_unavailable' as const,
      message: 'down',
      retryable: true,
      requestId: 'req-1'
    };
    const failed = applyRunFrame(fresh, {
      kind: 'failed',
      runId: 'run-1',
      seq: 1,
      error
    });
    expect(failed.status).toBe('failed');
    expect(failed.error).toEqual(error);
  });
});

describe('binding and settling', () => {
  it('binds the run id once', () => {
    const bound = bindRunId(fresh, 'run-1');
    expect(bound.runId).toBe('run-1');
    expect(bindRunId(bound, 'run-2')).toBe(bound);
  });

  it('fails or settles only a non-terminal turn', () => {
    const error = {
      code: 'internal_error' as const,
      message: 'x',
      retryable: false,
      requestId: ''
    };
    const failed = failLiveTurn(fresh, error);
    expect(failed.status).toBe('failed');
    expect(failLiveTurn(failed, error)).toBe(failed);
    expect(settleLiveTurn(failed, 'cancelled')).toBe(failed);
    expect(settleLiveTurn(fresh, 'streaming')).toBe(fresh);
    expect(settleLiveTurn(fresh, 'cancelled').status).toBe('cancelled');
  });
});

describe('appendLiveTurns', () => {
  const conversation: Conversation = {
    id: 'conv-1',
    projectId: 'proj-1',
    title: 'Selection chain',
    messages: [
      {
        id: 'msg-1',
        role: 'assistant',
        content: 'Hello',
        createdAt: '2026-10-01T09:00:00.000Z',
        toolCalls: []
      }
    ],
    isPinned: false,
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:00:00.000Z'
  };

  it('shows the prompt alone until the stream produces output', () => {
    const next = appendLiveTurns(conversation, [fresh]);
    expect(next.messages.map(message => message.role)).toEqual([
      'assistant',
      'user'
    ]);
    expect(next.messages[1]?.content).toBe(input.prompt);
  });

  it('appends the streamed reply after the prompt', () => {
    const streaming = applyRunFrame(fresh, {
      kind: 'textDelta',
      runId: 'run-1',
      seq: 1,
      text: 'Partial'
    });
    const next = appendLiveTurns(conversation, [streaming]);
    expect(next.messages[next.messages.length - 1]).toMatchObject({
      id: 'live-turn-1-reply',
      role: 'assistant',
      content: 'Partial'
    });
  });

  it('ignores turns of other conversations', () => {
    const other = createLiveTurn(
      'live-turn-2',
      { ...input, conversationId: 'conv-2' },
      startedAt
    );
    expect(appendLiveTurns(conversation, [other])).toBe(conversation);
    expect(findLatestTurn([fresh, other], 'conv-1')).toBe(fresh);
    expect(findLatestTurn([fresh], 'conv-2')).toBeNull();
  });
});
