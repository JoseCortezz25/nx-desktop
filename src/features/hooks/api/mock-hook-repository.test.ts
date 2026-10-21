import { describe, expect, it } from 'vitest';
import { createMockHookRepository } from './mock-hook-repository';

describe('hook repository', () => {
  it('ships six pending realistic hooks with both new and known entries', async () => {
    const hooks = await createMockHookRepository().listHooks();
    expect(hooks).toHaveLength(6);
    expect(new Set(hooks.map(hook => hook.id)).size).toBe(6);
    expect(hooks.filter(hook => !hook.isNew).length).toBeGreaterThanOrEqual(2);
    expect(hooks.some(hook => hook.isNew)).toBe(true);
    for (const hook of hooks) {
      expect(hook.id).toMatch(/^hook-/);
      expect(hook.name).not.toMatch(/^Hook \d$/);
      expect(hook.approvalStatus).toBe('pending');
      expect(hook.command.length).toBeGreaterThan(0);
      expect(hook.origin.length).toBeGreaterThan(0);
    }
    expect(new Set(hooks.map(hook => hook.timeoutMs))).toEqual(
      new Set([5000, 1500, 30000])
    );
  });
  it('accepts an explicit empty catalog', async () => {
    expect(await createMockHookRepository({ hooks: [] }).listHooks()).toEqual(
      []
    );
  });
  it('returns injected hooks through the typed seam', async () => {
    const hooks = await createMockHookRepository().listHooks();
    expect(await createMockHookRepository({ hooks }).listHooks()).toEqual(
      hooks
    );
  });
  it('stores a decision and lists the stored status afterwards', async () => {
    const repository = createMockHookRepository();
    const stored = await repository.setHookDecision(
      'hook-lint-on-write',
      'rejected'
    );
    expect(stored.approvalStatus).toBe('rejected');
    const hooks = await repository.listHooks();
    expect(
      hooks.find(hook => hook.id === 'hook-lint-on-write')?.approvalStatus
    ).toBe('rejected');
  });
  it('rejects a decision for a hook it does not list', async () => {
    await expect(
      createMockHookRepository().setHookDecision('hook-ghost', 'approved')
    ).rejects.toThrow('unknown hook');
  });
});
