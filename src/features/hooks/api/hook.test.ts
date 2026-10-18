/**
 * Contract and client tests for the hook review (issue #16, slice 4).
 *
 * Both fixtures are read by the Rust suite. The decision request is
 * project-scoped and carries no `runId`; the closed status set is the same one
 * `ProjectDto.hookDecisions` uses, so the two catalogs cannot drift.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import listHooksFixture from '../../../../docs/ipc/fixtures/hooks-list-hooks.json';
import setHookDecisionFixture from '../../../../docs/ipc/fixtures/hooks-set-hook-decision.json';
import type {
  HookDto,
  ListHooksRequestDto,
  SetHookDecisionRequestDto
} from './hook.contracts';
import { listHooks, setHookDecision } from './hook-client';

const ipcInvoke = vi.hoisted(() => vi.fn());

vi.mock('@/shared/ipc/client', () => ({ ipcInvoke }));

const expectedListRequest: ListHooksRequestDto = {
  projectId: 'proj-design-system'
};

const expectedHooks: HookDto[] = [
  {
    id: 'hook-lint-on-write',
    name: 'Lint on write',
    isNew: true,
    origin: 'Project configuration',
    hookType: 'PreToolUse',
    command: 'node .claude/hooks/lint-on-write.mjs',
    timeoutMs: 5000,
    approvalStatus: 'pending'
  },
  {
    id: 'hook-notify-tool-use',
    name: 'Notify on tool use',
    isNew: false,
    origin: 'Plugin',
    hookType: 'PostToolUse',
    command: 'node plugins/notifications/tool-use.mjs',
    timeoutMs: 1500,
    approvalStatus: 'approved'
  }
];

const expectedDecisionRequest: SetHookDecisionRequestDto = {
  projectId: 'proj-design-system',
  hookId: 'hook-lint-on-write',
  approvalStatus: 'rejected'
};

const expectedDecidedHook: HookDto = {
  ...expectedHooks[0],
  approvalStatus: 'rejected'
};

beforeEach(() => {
  ipcInvoke.mockReset();
});

describe('hook fixtures', () => {
  it('match the typed list and decision envelopes', () => {
    expect(listHooksFixture.request).toEqual(expectedListRequest);
    expect(listHooksFixture.response).toEqual(expectedHooks);
    expect(setHookDecisionFixture.request).toEqual(expectedDecisionRequest);
    expect(setHookDecisionFixture.response).toEqual(expectedDecidedHook);
  });

  it('keeps both requests project-scoped with no runId', () => {
    expect(listHooksFixture.request).not.toHaveProperty('runId');
    expect(setHookDecisionFixture.request).not.toHaveProperty('runId');
  });

  it('uses the closed pending/approved/rejected status values', () => {
    expect([
      listHooksFixture.response[0].approvalStatus,
      listHooksFixture.response[1].approvalStatus,
      setHookDecisionFixture.request.approvalStatus
    ]).toEqual(['pending', 'approved', 'rejected']);
  });
});

describe('hook client', () => {
  it('calls list_hooks with the project envelope', async () => {
    ipcInvoke.mockResolvedValue(expectedHooks);
    await expect(listHooks('proj-design-system')).resolves.toEqual(
      expectedHooks
    );
    expect(ipcInvoke).toHaveBeenCalledWith('list_hooks', {
      request: expectedListRequest
    });
  });

  it('calls set_hook_decision with the project, hook and status envelope', async () => {
    ipcInvoke.mockResolvedValue(expectedDecidedHook);
    await expect(
      setHookDecision('proj-design-system', 'hook-lint-on-write', 'rejected')
    ).resolves.toEqual(expectedDecidedHook);
    expect(ipcInvoke).toHaveBeenCalledWith('set_hook_decision', {
      request: expectedDecisionRequest
    });
  });
});
