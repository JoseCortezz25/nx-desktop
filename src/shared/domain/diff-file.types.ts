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

/**
 * Why a changed file is listed without hunks (issue #196): its content is not
 * text, or it is too large to draw.
 */
export const DIFF_FILE_NOTICES = ['binary', 'too_large'] as const;

export type DiffFileNotice = (typeof DIFF_FILE_NOTICES)[number];

export interface DiffFile {
  readonly path: string;
  readonly addedCount: number;
  readonly removedCount: number;
  readonly hunks: readonly DiffHunk[];
  /** Present only when the file is listed without hunks on purpose. */
  readonly notice?: DiffFileNotice;
}
