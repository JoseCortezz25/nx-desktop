/**
 * Pure rules of the `DiffView` organism (screen 18).
 *
 * The view renders one collapsible section per changed file, and inside it the
 * unified hunk table: a header line plus one row per diff line, with the old and
 * new line numbers the wireframe prints in the two gutter columns
 * (`docs/wireframes/18-chat-with-diff.html`, `table.diff`).
 *
 * The domain carries no line numbers (`src/shared/domain/diff-file.types.ts`
 * stores only `kind` and `content`), so the gutters are **derived** from the
 * hunk header: a removed line advances only the old side, an added line only the
 * new one, a context line both. A header this module cannot read leaves the
 * numbers empty instead of inventing an offset.
 *
 * The collapse state is a set of paths rather than a boolean per file so the
 * caller owns it plainly (one render-phase owner) and expanding one file never
 * touches another. Counts always come from the repository's `addedCount` /
 * `removedCount`; `countDiffLines` exists to prove the shipped data agrees with
 * its own lines, not to second-guess it.
 */
import type {
  DiffFile,
  DiffHunk,
  DiffLineKind
} from '@/shared/domain/diff-file.types';

/** One rendered row of a hunk: both gutters, the marker and the code. */
export interface DiffHunkRow {
  /** The line's relation to the previous revision, for row styling. */
  readonly kind: DiffLineKind;
  /** `+` for an added line, `-` for a removed one, empty for context. */
  readonly marker: '' | '+' | '-';
  /** Old-revision line number, or `null` on the added side. */
  readonly oldNumber: number | null;
  /** New-revision line number, or `null` on the removed side. */
  readonly newNumber: number | null;
  readonly content: string;
}

/** Per-file and total add/remove counts. */
export interface DiffSummary {
  readonly fileCount: number;
  readonly added: number;
  readonly removed: number;
}

/** A section's collapse state, keyed by file path. */
export type CollapsedDiffSections = ReadonlySet<string>;

/** Every section starts expanded; collapsing is always an explicit act. */
export const INITIAL_COLLAPSED_SECTIONS: CollapsedDiffSections = new Set();

/** A hunk header's two starting line numbers, e.g. `@@ -6,7 +6,12 @@`. */
const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

const MARKERS: Readonly<Record<DiffLineKind, '' | '+' | '-'>> = {
  context: '',
  added: '+',
  removed: '-'
};

/**
 * Reads a hunk header's starting numbers. A header whose numbers are not
 * positive safe integers is treated as unreadable, so an `@@ -0 +0 @@` or an
 * out-of-range offset prints no gutter instead of a wrong or rounded one.
 */
function readStartNumber(raw: string): number | null {
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 1 ? value : null;
}

function advance(number: number | null): number | null {
  return number === null ? null : number + 1;
}

/**
 * Builds the rows of one hunk. Both gutters start at the numbers its header
 * declares and each row carries the state *before* the line is consumed, so a
 * removed line shows its old number and leaves the new gutter empty.
 */
export function buildHunkRows(hunk: DiffHunk): readonly DiffHunkRow[] {
  const start = HUNK_HEADER.exec(hunk.header);
  let oldNumber = start ? readStartNumber(start[1]) : null;
  let newNumber = start ? readStartNumber(start[2]) : null;

  return hunk.lines.map(line => {
    const marker = MARKERS[line.kind];
    const row: DiffHunkRow =
      line.kind === 'added'
        ? {
            kind: line.kind,
            marker,
            oldNumber: null,
            newNumber,
            content: line.content
          }
        : line.kind === 'removed'
          ? {
              kind: line.kind,
              marker,
              oldNumber,
              newNumber: null,
              content: line.content
            }
          : {
              kind: line.kind,
              marker,
              oldNumber,
              newNumber,
              content: line.content
            };

    if (line.kind !== 'added') {
      oldNumber = advance(oldNumber);
    }
    if (line.kind !== 'removed') {
      newNumber = advance(newNumber);
    }

    return row;
  });
}

/** Counts the added and removed lines of every hunk of a file. */
export function countDiffLines(hunks: readonly DiffHunk[]): {
  readonly added: number;
  readonly removed: number;
} {
  return hunks.reduce(
    (total, hunk) =>
      hunk.lines.reduce(
        (counted, line) =>
          line.kind === 'added'
            ? { ...counted, added: counted.added + 1 }
            : line.kind === 'removed'
              ? { ...counted, removed: counted.removed + 1 }
              : counted,
        total
      ),
    { added: 0, removed: 0 }
  );
}

/**
 * The summary bar's numbers: how many files changed and the totals the file
 * headers already carry, so the bar can never disagree with the sections.
 */
export function summarizeDiff(files: readonly DiffFile[]): DiffSummary {
  return {
    fileCount: files.length,
    added: files.reduce((total, file) => total + file.addedCount, 0),
    removed: files.reduce((total, file) => total + file.removedCount, 0)
  };
}

/** Whether the workspace has nothing to show; the view owns the empty copy. */
export function isDiffEmpty(files: readonly DiffFile[]): boolean {
  return files.length === 0;
}

/** Whether one file's section is collapsed. */
export function isDiffSectionCollapsed(
  collapsed: CollapsedDiffSections,
  path: string
): boolean {
  return collapsed.has(path);
}

/**
 * Flips one file's section and leaves the rest untouched. Returns a new set, so
 * the input can be used directly as a React state value.
 */
export function toggleDiffSection(
  collapsed: CollapsedDiffSections,
  path: string
): CollapsedDiffSections {
  const next = new Set(collapsed);
  if (next.has(path)) {
    next.delete(path);
  } else {
    next.add(path);
  }
  return next;
}
