/**
 * Pure rules of the hooks review (screens 14–15).
 *
 * Selection belongs to the caller; every toggle returns a fresh set. The new
 * count drives the composer's indicator, independently of selection or approval.
 * Timeouts are provider data rendered as seconds, not a locale-dependent date.
 */
import type { Hook } from '@/shared/domain/hook.types';
import type { HookId } from '@/shared/domain/value-objects.types';

export function countNewHooks(hooks: readonly Hook[]): number {
  return hooks.filter(hook => hook.isNew).length;
}

/**
 * Flips one id in a set. Both sets the surface keeps use it: the selection the
 * caller owns and the expanded rows this dialog owns, so a new set is always
 * returned and neither owner can be mutated behind its back.
 */
export function toggleHookId(
  ids: ReadonlySet<HookId>,
  hookId: HookId
): ReadonlySet<HookId> {
  const next = new Set(ids);
  if (next.has(hookId)) next.delete(hookId);
  else next.add(hookId);
  return next;
}

export function isHookSelected(
  selected: ReadonlySet<HookId>,
  hookId: HookId
): boolean {
  return selected.has(hookId);
}

export function formatHookTimeout(timeoutMs: number): string {
  return `${timeoutMs / 1000} s`;
}

/** The range a footer decision applies to: the whole review or the selection. */
export type HookDecisionScope = 'selection' | 'all';

/**
 * The hook ids one footer decision writes, in list order. `all` covers every
 * reviewed hook; `selection` only the selected ones that are still listed, so a
 * stale id never reaches the core.
 */
export function resolveDecisionHookIds(
  hooks: readonly Hook[],
  selected: ReadonlySet<HookId>,
  scope: HookDecisionScope
): readonly HookId[] {
  return hooks
    .filter(hook => scope === 'all' || selected.has(hook.id))
    .map(hook => hook.id);
}

/**
 * Replaces each listed hook with the version the core stored, keeping list
 * order; hooks the core did not answer for stay as they were.
 */
export function applyStoredHooks(
  hooks: readonly Hook[],
  stored: readonly Hook[]
): readonly Hook[] {
  const byId = new Map(stored.map(hook => [hook.id, hook]));
  return hooks.map(hook => byId.get(hook.id) ?? hook);
}
