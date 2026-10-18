import type { SubagentId } from '@/shared/domain/value-objects.types';

/** Navigation stores identity only; the catalog remains the record authority. */
export type SubagentsFocus =
  | { readonly kind: 'list' }
  | { readonly kind: 'detail'; readonly subagentId: SubagentId };

export function selectSubagent(
  focus: SubagentsFocus,
  subagentId: SubagentId
): SubagentsFocus {
  return focus.kind === 'detail' && focus.subagentId === subagentId
    ? focus
    : { kind: 'detail', subagentId };
}

export function backToList(focus: SubagentsFocus): SubagentsFocus {
  return focus.kind === 'list' ? focus : { kind: 'list' };
}

/** The caller consumes each count once; this projection holds no request state. */
export function focusRequest(
  count: number,
  id: SubagentId | null
): SubagentsFocus {
  return count > 0 && id !== null
    ? { kind: 'detail', subagentId: id }
    : { kind: 'list' };
}
