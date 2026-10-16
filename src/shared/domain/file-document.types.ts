/**
 * A workspace file opened in the right panel's `FileViewer`.
 *
 * The viewer draws one of two content modes — the rendered Markdown view or the
 * source view with line numbers — selected from the file's name
 * (`docs/wireframes/README.md`, "Reusable components" — `FileViewer`; screens
 * 03, 13 and 23). It is read through the file port and never resolved, read or
 * rendered by the panel itself.
 *
 * The path stays workspace-relative, the exact form a `FileChip` emits and the
 * screen-23 breadcrumb draws, so the chip, the tab and the breadcrumb all name
 * the same file the same way.
 */

export interface FileDocument {
  /** Workspace-relative path of the file. */
  readonly path: string;
  /** Full file contents, as read from the workspace. */
  readonly content: string;
}
