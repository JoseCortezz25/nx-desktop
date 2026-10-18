import { describe, expect, it } from 'vitest';
import type { Subagent } from '@/shared/domain/subagent.types';
import {
  formatElapsed,
  groupSubagents,
  RECENT_TRANSCRIPT_COUNT,
  splitTranscript,
  stopSubagent
} from './subagent-view';

const NOW = '2026-10-18T09:00:00Z';

function subagent(overrides: Partial<Subagent> = {}): Subagent {
  return {
    id: 'subagent-1',
    name: 'Inspect repo',
    avatar: 'globe',
    status: { kind: 'processing' },
    elapsedMs: 359_000,
    modelId: 'gpt-5-codex',
    effortLevel: 'light',
    transcript: [],
    ...overrides
  };
}

describe('subagent groups', () => {
  it('groups one kind per group, active first and dropouts last', () => {
    const groups = groupSubagents([
      subagent({ id: 'subagent-done', status: { kind: 'finished' } }),
      subagent({ id: 'subagent-live', status: { kind: 'processing' } }),
      subagent({ id: 'subagent-dead', status: { kind: 'failed' } }),
      subagent({ id: 'subagent-stopped', status: { kind: 'cancelled' } }),
      subagent({ id: 'subagent-live-2', status: { kind: 'processing' } })
    ]);

    expect(groups.map(group => group.kind)).toEqual([
      'processing',
      'finished',
      'cancelled',
      'failed'
    ]);
    expect(groups[0]?.subagents.map(one => one.id)).toEqual([
      'subagent-live',
      'subagent-live-2'
    ]);
  });

  it('keeps the input order inside one group and skips absent kinds', () => {
    const one = subagent({ id: 'subagent-1' });
    const two = subagent({ id: 'subagent-2' });
    const groups = groupSubagents([one, two, subagent({ id: 'subagent-3' })]);

    expect(groups.map(group => group.subagents.map(entry => entry.id))).toEqual(
      [['subagent-1', 'subagent-2', 'subagent-3']]
    );
    expect(groupSubagents([])).toEqual([]);
  });
});

describe('the individually stopped subagent', () => {
  it('resolves a processing subagent to cancelled', () => {
    const live = subagent({ status: { kind: 'processing' } });

    expect(stopSubagent(live)).toEqual({
      ...live,
      status: { kind: 'cancelled' }
    });
  });

  it('never resolves a finished, failed or already-cancelled run again', () => {
    const done = subagent({ status: { kind: 'finished' } });
    const failed = subagent({ status: { kind: 'failed' } });
    const stopped = subagent({ status: { kind: 'cancelled' } });

    expect(stopSubagent(done)).toBe(done);
    expect(stopSubagent(failed)).toBe(failed);
    expect(stopSubagent(stopped)).toBe(stopped);
  });

  it('does not mutate the record it stops', () => {
    const live = subagent({ status: { kind: 'processing' } });

    stopSubagent(live);

    expect(live.status).toEqual({ kind: 'processing' });
  });
});

describe('the transcript recent window', () => {
  const MARKERS = ['m1', 'm2', 'm3', 'm4', 'm5'];

  function entries(count: number) {
    return MARKERS.slice(0, count).map(id => ({
      id,
      role: 'assistant' as const,
      content: `entry ${id}`,
      createdAt: NOW,
      toolCalls: []
    }));
  }

  it('keeps the last entries visible and counts the earlier ones', () => {
    const { earlier, recent } = splitTranscript(entries(5));

    expect(earlier.map(entry => entry.id)).toEqual(['m1', 'm2']);
    expect(recent.map(entry => entry.id)).toEqual(['m3', 'm4', 'm5']);
  });

  it('releases nothing when the whole transcript fits the window', () => {
    const { earlier, recent } = splitTranscript(entries(3));

    expect(earlier).toEqual([]);
    expect(recent.map(entry => entry.id)).toEqual(['m1', 'm2', 'm3']);
  });

  it('honours an explicit window and never reads past the transcript', () => {
    const { earlier, recent } = splitTranscript(entries(2), 1);

    expect(earlier.map(entry => entry.id)).toEqual(['m1']);
    expect(recent.map(entry => entry.id)).toEqual(['m2']);
    expect(splitTranscript(entries(5), 0)).toEqual({
      earlier: entries(5),
      recent: []
    });
    expect(splitTranscript([], 3)).toEqual({ earlier: [], recent: [] });
  });

  it('does not mutate the transcript it partitions', () => {
    const full = entries(5);

    splitTranscript(full);

    expect(full).toHaveLength(5);
  });

  it('the default recent window is three entries', () => {
    expect(RECENT_TRANSCRIPT_COUNT).toBe(3);
  });
});

describe('elapsed time copy', () => {
  it('formats under a minute in seconds and the wireframe times in minutes', () => {
    expect(formatElapsed(0)).toBe('0s');
    expect(formatElapsed(59_000)).toBe('59s');
    expect(formatElapsed(359_000)).toBe('5m 59s');
    expect(formatElapsed(373_000)).toBe('6m 13s');
  });

  it('drops the seconds past the hour boundary', () => {
    expect(formatElapsed(3_601_000)).toBe('1h 0m');
    expect(formatElapsed(3_673_000)).toBe('1h 1m');
  });

  it('rounds a partial unit down to whole units', () => {
    expect(formatElapsed(60_000)).toBe('1m 0s');
    expect(formatElapsed(90_000)).toBe('1m 30s');
  });
});
