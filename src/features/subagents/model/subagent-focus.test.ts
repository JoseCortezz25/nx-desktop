import { describe, expect, it } from 'vitest';
import {
  backToList,
  focusRequest,
  selectSubagent,
  type SubagentsFocus
} from './subagent-focus';

describe('subagent focus', () => {
  it('selects a detail from the list and returns to the list', () => {
    const list: SubagentsFocus = { kind: 'list' };
    const detail = selectSubagent(list, 'subagent-inspect-repo');

    expect(detail).toEqual({
      kind: 'detail',
      subagentId: 'subagent-inspect-repo'
    });
    expect(backToList(detail)).toEqual({ kind: 'list' });
  });

  it('selects another record without mutating the previous focus', () => {
    const detail: SubagentsFocus = Object.freeze({
      kind: 'detail',
      subagentId: 'first'
    });
    expect(selectSubagent(detail, 'second')).toEqual({
      kind: 'detail',
      subagentId: 'second'
    });
    expect(detail).toEqual({ kind: 'detail', subagentId: 'first' });
    backToList(detail);
    expect(detail.kind).toBe('detail');
  });

  it('opens a requested id only when the request count is positive', () => {
    expect(focusRequest(1, 'first')).toEqual({
      kind: 'detail',
      subagentId: 'first'
    });
    expect(focusRequest(2, 'second')).toEqual({
      kind: 'detail',
      subagentId: 'second'
    });
    expect(focusRequest(0, 'first')).toEqual({ kind: 'list' });
    expect(focusRequest(-1, 'first')).toEqual({ kind: 'list' });
    expect(focusRequest(1, null)).toEqual({ kind: 'list' });
  });

  it('keeps list and already-selected focus records unchanged', () => {
    const list: SubagentsFocus = { kind: 'list' };
    const detail: SubagentsFocus = { kind: 'detail', subagentId: 'first' };
    expect(backToList(list)).toBe(list);
    expect(selectSubagent(detail, 'first')).toBe(detail);
  });
});
