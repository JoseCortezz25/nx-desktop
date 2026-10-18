import { describe, expect, it } from 'vitest';
import type { DiffFile, DiffHunk } from '@/shared/domain/diff-file.types';
import {
  buildHunkRows,
  countDiffLines,
  isDiffEmpty,
  isDiffSectionCollapsed,
  summarizeDiff,
  toggleDiffSection
} from './diff-view';

function hunk(header: string, lines: DiffHunk['lines']): DiffHunk {
  return { header, lines };
}

function file(
  path: string,
  hunks: readonly DiffHunk[],
  addedCount: number,
  removedCount: number
): DiffFile {
  return { path, addedCount, removedCount, hunks };
}

describe('diff hunk rows', () => {
  it('numbers context lines on both sides', () => {
    const rows = buildHunkRows(
      hunk('@@ -6,2 +6,2 @@ function App()', [
        { kind: 'context', content: 'function App() {' },
        { kind: 'context', content: '  return null;' }
      ])
    );

    expect(rows).toEqual([
      {
        kind: 'context',
        marker: '',
        oldNumber: 6,
        newNumber: 6,
        content: 'function App() {'
      },
      {
        kind: 'context',
        marker: '',
        oldNumber: 7,
        newNumber: 7,
        content: '  return null;'
      }
    ]);
  });

  it('advances only the old side for a removed line and only the new side for an added one', () => {
    const rows = buildHunkRows(
      hunk('@@ -7,2 +7,3 @@', [
        { kind: 'removed', content: 'old' },
        { kind: 'added', content: 'new' }
      ])
    );

    expect(rows[0]).toEqual({
      kind: 'removed',
      marker: '-',
      oldNumber: 7,
      newNumber: null,
      content: 'old'
    });
    expect(rows[1]).toEqual({
      kind: 'added',
      marker: '+',
      oldNumber: null,
      newNumber: 7,
      content: 'new'
    });
  });

  it('keeps the two sides independent across interleaved lines', () => {
    const rows = buildHunkRows(
      hunk('@@ -10,3 +20,4 @@', [
        { kind: 'context', content: 'a' },
        { kind: 'removed', content: 'b' },
        { kind: 'added', content: 'c' },
        { kind: 'added', content: 'd' },
        { kind: 'context', content: 'e' }
      ])
    );

    expect(rows.map(row => [row.oldNumber, row.newNumber])).toEqual([
      [10, 20],
      [11, null],
      [null, 21],
      [null, 22],
      [12, 23]
    ]);
  });

  it('omits the numbers of a single-line hunk range', () => {
    const rows = buildHunkRows(
      hunk('@@ -3 +3 @@ return (', [
        { kind: 'removed', content: 'a' },
        { kind: 'added', content: 'b' }
      ])
    );

    expect(rows.map(row => [row.oldNumber, row.newNumber])).toEqual([
      [3, null],
      [null, 3]
    ]);
  });

  it('refuses a range that cannot start at the line it names', () => {
    const rows = buildHunkRows(
      hunk('@@ -0 +0 @@', [
        { kind: 'context', content: 'a' },
        { kind: 'added', content: 'b' }
      ])
    );

    // Line numbers start at 1, so a zero start is an unreadable header: the gutters
    // stay empty instead of printing `0` and counting up from a line that cannot
    // exist.
    expect(rows.map(row => [row.oldNumber, row.newNumber])).toEqual([
      [null, null],
      [null, null]
    ]);
  });

  it('refuses a start it cannot represent exactly', () => {
    const rows = buildHunkRows(
      hunk('@@ -9007199254740993 +3 @@', [
        { kind: 'removed', content: 'a' },
        { kind: 'context', content: 'b' }
      ])
    );

    // Past 2^53 the number would be silently rounded, so neither side is printed.
    expect(rows.map(row => [row.oldNumber, row.newNumber])).toEqual([
      [null, null],
      [null, 3]
    ]);
  });

  it('stops numbering a gutter it can no longer represent exactly', () => {
    const rows = buildHunkRows(
      hunk('@@ -9007199254740991,3 +1,3 @@', [
        { kind: 'context', content: 'a' },
        { kind: 'context', content: 'b' },
        { kind: 'context', content: 'c' }
      ])
    );

    // Advancing past 2^53 would print a rounded line number, so that gutter stops
    // instead of lying; the other side keeps counting.
    expect(rows.map(row => [row.oldNumber, row.newNumber])).toEqual([
      [9007199254740991, 1],
      [null, 2],
      [null, 3]
    ]);
  });

  it('renders the lines without numbers when the hunk header is unreadable', () => {
    const rows = buildHunkRows(
      hunk('not a hunk header', [{ kind: 'added', content: 'x' }])
    );

    expect(rows).toEqual([
      {
        kind: 'added',
        marker: '+',
        oldNumber: null,
        newNumber: null,
        content: 'x'
      }
    ]);
  });
});

describe('diff counts', () => {
  it('counts added and removed lines of every hunk of a file', () => {
    const counted = countDiffLines([
      hunk('@@ -1,2 +1,3 @@', [
        { kind: 'context', content: 'a' },
        { kind: 'removed', content: 'b' },
        { kind: 'added', content: 'c' }
      ]),
      hunk('@@ -9,1 +10,2 @@', [
        { kind: 'added', content: 'd' },
        { kind: 'added', content: 'e' }
      ])
    ]);

    expect(counted).toEqual({ added: 3, removed: 1 });
  });

  it('sums the declared per-file counts and the file number', () => {
    const summary = summarizeDiff([
      file('src/App.tsx', [], 9, 4),
      file('src-tauri/src/lib.rs', [], 5, 2)
    ]);

    expect(summary).toEqual({ fileCount: 2, added: 14, removed: 6 });
  });

  it('reports an empty change set', () => {
    expect(isDiffEmpty([])).toBe(true);
    expect(isDiffEmpty([file('src/App.tsx', [], 1, 0)])).toBe(false);
  });
});

describe('diff section collapse', () => {
  it('starts with every section expanded', () => {
    expect(isDiffSectionCollapsed(new Set(), 'src/App.tsx')).toBe(false);
  });

  it('collapses and expands the section of one path only', () => {
    const collapsed = toggleDiffSection(new Set<string>(), 'src/App.tsx');

    expect(isDiffSectionCollapsed(collapsed, 'src/App.tsx')).toBe(true);
    expect(isDiffSectionCollapsed(collapsed, 'src-tauri/src/lib.rs')).toBe(
      false
    );

    const expanded = toggleDiffSection(collapsed, 'src/App.tsx');
    expect(isDiffSectionCollapsed(expanded, 'src/App.tsx')).toBe(false);
  });

  it('never mutates the set it receives', () => {
    const collapsed = new Set<string>();

    toggleDiffSection(collapsed, 'src/App.tsx');

    expect(collapsed.size).toBe(0);
  });
});
