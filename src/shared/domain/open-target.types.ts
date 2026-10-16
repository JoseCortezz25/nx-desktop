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

/**
 * Targets the `Abrir` menu offers.
 *
 * `.claude/knowledge/business-logic.md` §3.5 item 3 (decision 2026-10-16): only
 * VS Code is offered, and only when it is installed on the machine; no other
 * editor or shell target replaces it for now. `OPEN_TARGETS` above still
 * enumerates `reveal_in_file_manager` because the vocabulary predates that
 * decision — the entry is **not** an instruction to offer it. This list is what
 * the menu reads, so the restriction is a value the tests can assert.
 */
export const OPEN_MENU_TARGETS = ['editor'] as const;

/** One external target's availability on the machine, reported by the port. */
export interface OpenTargetAvailability {
  readonly target: OpenTarget;
  readonly isInstalled: boolean;
}
