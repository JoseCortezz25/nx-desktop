/**
 * A single file change rendered by the `DiffView` organism.
 *
 * Mirrors the per-file collapsible sections in screen 18
 * (`docs/wireframes/README.md`, "Reusable components" and "State and data the UI
 * implies").
 */
export const DIFF_LINE_KINDS = ['context', 'added', 'removed'] as const;

/** How a diff line relates to the previous revision. */
export type DiffLineKind = (typeof DIFF_LINE_KINDS)[number];

export interface DiffLine {
  readonly kind: DiffLineKind;
  readonly content: string;
}

export interface DiffHunk {
  /** Hunk header, e.g. `@@ -12,7 +12,9 @@`. */
  readonly header: string;
  readonly lines: readonly DiffLine[];
}

export interface DiffFile {
  readonly path: string;
  readonly addedCount: number;
  readonly removedCount: number;
  readonly hunks: readonly DiffHunk[];
}
