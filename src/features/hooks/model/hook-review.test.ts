import { describe, expect, it } from 'vitest';
import type { Hook } from '@/shared/domain/hook.types';
import {
  countNewHooks,
  toggleHookId,
  isHookSelected,
  formatHookTimeout,
  resolveDecisionHookIds,
  applyStoredHooks
} from './hook-review';

const hooks: readonly Hook[] = [
  {
    id: 'hook-lint',
    name: 'Lint',
    isNew: true,
    origin: 'Project',
    hookType: 'PreToolUse',
    command: 'pnpm lint',
    timeoutMs: 5000,
    approvalStatus: 'pending'
  },
  {
    id: 'hook-format',
    name: 'Format',
    isNew: false,
    origin: 'User',
    hookType: 'PostToolUse',
    command: 'pnpm format',
    timeoutMs: 1500,
    approvalStatus: 'pending'
  }
];

describe('hook review rules', () => {
  it('counts only new hooks, including an empty catalog', () => {
    expect(countNewHooks(hooks)).toBe(1);
    expect(countNewHooks([])).toBe(0);
  });
  it('toggles selection without mutating the previous set', () => {
    const initial = new Set(['hook-format']);
    const selected = toggleHookId(initial, 'hook-lint');
    expect(isHookSelected(selected, 'hook-lint')).toBe(true);
    expect(isHookSelected(initial, 'hook-lint')).toBe(false);
    const removed = toggleHookId(selected, 'hook-lint');
    expect([...removed]).toEqual(['hook-format']);
    expect(selected.size).toBe(2);
  });
  it.each([
    [5000, '5 s'],
    [1500, '1.5 s'],
    [30000, '30 s'],
    [0, '0 s']
  ])('formats %i milliseconds as %s', (value, expected) => {
    expect(formatHookTimeout(value)).toBe(expected);
  });
});

describe('resolveDecisionHookIds', () => {
  const listed: readonly Hook[] = ['hook-a', 'hook-b', 'hook-c'].map(id => ({
    id,
    name: id,
    isNew: false,
    origin: 'Project',
    hookType: 'PreToolUse',
    command: 'pnpm lint',
    timeoutMs: 1000,
    approvalStatus: 'pending'
  }));

  it('covers every listed hook for the whole review', () => {
    expect(resolveDecisionHookIds(listed, new Set(['hook-b']), 'all')).toEqual([
      'hook-a',
      'hook-b',
      'hook-c'
    ]);
  });

  it('keeps only listed selected hooks, in list order', () => {
    expect(
      resolveDecisionHookIds(
        listed,
        new Set(['hook-c', 'hook-ghost', 'hook-a']),
        'selection'
      )
    ).toEqual(['hook-a', 'hook-c']);
  });

  it('replaces listed hooks with the stored version and keeps the rest', () => {
    const stored = { ...listed[1], approvalStatus: 'approved' as const };
    const merged = applyStoredHooks(listed, [stored]);

    expect(merged.map(hook => hook.approvalStatus)).toEqual([
      'pending',
      'approved',
      'pending'
    ]);
    expect(merged[0]).toBe(listed[0]);
  });
});
