/**
 * Repository tests for the IPC-backed hook review (issue #24).
 *
 * Both calls carry the bound project; the decision resolves the hook the core
 * stored, mapped from the shared wire fixture.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import listFixture from '../../../../docs/ipc/fixtures/hooks-list-hooks.json';
import decisionFixture from '../../../../docs/ipc/fixtures/hooks-set-hook-decision.json';
import permissionDenied from '../../../../docs/ipc/fixtures/app-error-permission-denied.json';
import type { HookApprovalStatus } from '@/shared/domain/hook.types';
import { createIpcHookRepository } from './ipc-hook-repository';

const listHooks = vi.hoisted(() => vi.fn());
const setHookDecision = vi.hoisted(() => vi.fn());

vi.mock('./hook-client', () => ({ listHooks, setHookDecision }));

beforeEach(() => {
  listHooks.mockReset();
  setHookDecision.mockReset();
});

describe('createIpcHookRepository', () => {
  it('lists the bound project hooks mapped to the domain', async () => {
    listHooks.mockResolvedValue(listFixture.response);

    const hooks = await createIpcHookRepository(
      listFixture.request.projectId
    ).listHooks();

    expect(listHooks).toHaveBeenCalledWith(listFixture.request.projectId);
    expect(hooks).toEqual(listFixture.response);
    expect(hooks[0]).not.toBe(listFixture.response[0]);
  });

  it('records a decision and resolves the stored hook', async () => {
    setHookDecision.mockResolvedValue(decisionFixture.response);
    const { projectId, hookId, approvalStatus } = decisionFixture.request;

    const stored = await createIpcHookRepository(projectId).setHookDecision(
      hookId,
      approvalStatus as HookApprovalStatus
    );

    expect(setHookDecision).toHaveBeenCalledWith(
      projectId,
      hookId,
      approvalStatus
    );
    expect(stored).toEqual(decisionFixture.response);
  });

  it('propagates a rejected decision', async () => {
    setHookDecision.mockRejectedValue(permissionDenied);

    await expect(
      createIpcHookRepository('proj-ghost').setHookDecision(
        'hook-lint-on-write',
        'approved'
      )
    ).rejects.toEqual(permissionDenied);
  });
});
