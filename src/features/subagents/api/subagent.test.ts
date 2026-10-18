/**
 * Contract and client tests for subagents (issue #16, slice 3).
 *
 * The fixtures are the same JSON the Rust suite reads. The typed literals pin
 * the flat four-state status, the reused conversation transcript and the
 * authority-bearing `runId` / `subagentId`; the client tests pin the command
 * names and the `{ request }` envelopes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import cancelFixture from '../../../../docs/ipc/fixtures/subagents-cancel-subagent.json';
import listFixture from '../../../../docs/ipc/fixtures/subagents-list-subagents.json';
import type {
  CancelSubagentRequestDto,
  ListSubagentsRequestDto,
  SubagentDto
} from './subagent.contracts';
import { cancelSubagent, listSubagents } from './subagent-client';

const ipcInvoke = vi.hoisted(() => vi.fn());

vi.mock('@/shared/ipc/client', () => ({ ipcInvoke }));

const inspectRepo: SubagentDto = {
  id: 'subagent-inspect-repo',
  name: 'Inspect repo',
  avatar: 'globe',
  status: 'finished',
  elapsedMs: 359_000,
  modelId: 'gpt-5-codex',
  effortLevel: 'light',
  transcript: [
    {
      id: 'sa-13',
      role: 'assistant',
      content: 'Draft recommendations for the module boundaries.',
      createdAt: '2026-10-18T09:12:00.000Z',
      toolCalls: []
    }
  ]
};

const verifyTests: SubagentDto = {
  id: 'subagent-verify-tests',
  name: 'Verify tests',
  avatar: 'flower',
  status: 'processing',
  elapsedMs: 8_000,
  modelId: 'glm-4.6',
  effortLevel: 'maximum',
  transcript: []
};

const cancelledVerifyTests: SubagentDto = {
  ...verifyTests,
  status: 'cancelled'
};

const expectedListRequest: ListSubagentsRequestDto = {
  runId: 'run-7f2a9c10'
};

const expectedCancelRequest: CancelSubagentRequestDto = {
  runId: 'run-7f2a9c10',
  subagentId: 'subagent-verify-tests'
};

beforeEach(() => {
  ipcInvoke.mockReset();
});

describe('subagent fixtures', () => {
  it('match the typed run subagent list and its authority request', () => {
    expect(listFixture.request).toEqual(expectedListRequest);
    expect(listFixture.response).toEqual([inspectRepo, verifyTests]);
  });

  it('match the individual-stop request and cancelled snapshot', () => {
    expect(cancelFixture.request).toEqual(expectedCancelRequest);
    expect(cancelFixture.response).toEqual(cancelledVerifyTests);
  });
});

describe('subagent client', () => {
  it('calls list_subagents with the run envelope', async () => {
    ipcInvoke.mockResolvedValue([inspectRepo, verifyTests]);
    await expect(listSubagents('run-7f2a9c10')).resolves.toEqual([
      inspectRepo,
      verifyTests
    ]);
    expect(ipcInvoke).toHaveBeenCalledWith('list_subagents', {
      request: expectedListRequest
    });
  });

  it('calls cancel_subagent with the run and subagent envelope', async () => {
    ipcInvoke.mockResolvedValue(cancelledVerifyTests);
    await expect(
      cancelSubagent('run-7f2a9c10', 'subagent-verify-tests')
    ).resolves.toEqual(cancelledVerifyTests);
    expect(ipcInvoke).toHaveBeenCalledWith('cancel_subagent', {
      request: expectedCancelRequest
    });
  });
});
