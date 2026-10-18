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
