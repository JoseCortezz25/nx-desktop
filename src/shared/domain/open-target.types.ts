/**
 * External destinations offered by the `OpenWithMenu` split button.
 *
 * The default action opens the editor; the file-manager entry is OS dependent
 * (`docs/wireframes/README.md`, "Reusable components" and "State and data the UI
 * implies").
 */
export const OPEN_TARGETS = [
  'editor',
  'view_source',
  'search_in_file',
  'reveal_in_file_manager',
  'copy_path'
] as const;

/** A place a file or file selection can be opened into. */
export type OpenTarget = (typeof OPEN_TARGETS)[number];
