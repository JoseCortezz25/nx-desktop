/**
 * Composer draft rules.
 *
 * The draft is React-owned ephemeral presentation state — the shell's unsent
 * prompt (`.claude/knowledge/critical-constraints.md` §8: "unsent composer
 * draft"). Keeping typing and submitting as pure transitions outside the
 * component is what makes the ticket's "typing and submitting produce a callback
 * carrying the text" behaviour unit-testable: this repository's test runner runs
 * in a node environment with no DOM, so the rule must not live inside JSX event
 * wiring to be observable.
 */
export interface ComposerDraft {
  readonly text: string;
}

/** The empty state the home screen renders. */
export const EMPTY_COMPOSER_DRAFT: ComposerDraft = { text: '' };

/** Turns a field change (one keystroke or a paste) into the draft it produces. */
export function typeInDraft(text: string): ComposerDraft {
  return { text };
}

/**
 * A draft is submittable only when it carries non-whitespace text. The composer
 * keeps its send control enabled on the empty state to match the wireframe, so
 * this rule — not a disabled attribute — is what protects the submit path.
 */
export function isSubmittable(draft: ComposerDraft): boolean {
  return draft.text.trim().length > 0;
}

/**
 * Submits the draft: hands its text to `onSubmit` and returns the emptied draft
 * the composer keeps. An empty or whitespace-only draft is returned untouched
 * and `onSubmit` is never called, so pressing send on the empty home screen is a
 * no-op.
 */
export function submitDraft(
  draft: ComposerDraft,
  onSubmit: (text: string) => void
): ComposerDraft {
  if (!isSubmittable(draft)) {
    return draft;
  }
  onSubmit(draft.text);
  return EMPTY_COMPOSER_DRAFT;
}

/**
 * Submits the draft only while a `provider -> model -> effort` chain is
 * selected. No provider is preselected (decision 2026-10-20), so a send with no
 * selection is blocked: `onSubmit` is never called and the draft is returned
 * untouched, which keeps the user's prompt in the field until they choose a
 * provider and a model.
 */
export function submitDraftWithSelection(
  draft: ComposerDraft,
  hasSelection: boolean,
  onSubmit: (text: string) => void
): ComposerDraft {
  return hasSelection ? submitDraft(draft, onSubmit) : draft;
}

/**
 * The parts of a key press the composer's key rule reads. A plain shape (not a
 * DOM event) so the rule stays testable in the node test runner.
 */
export interface ComposerKeyPress {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  /** `true` while an IME composition is active (`nativeEvent.isComposing`). */
  readonly isComposing: boolean;
  /** Legacy key code; `229` marks a key press an IME is still processing. */
  readonly keyCode: number;
}

/**
 * What a key press in the prompt field means: `submit` sends through the same
 * guarded path as the send button, `none` leaves the browser default (a
 * newline for Shift+Enter, normal typing for every other key).
 */
export type ComposerKeyIntent = 'submit' | 'none';

const IME_PROCESSING_KEY_CODE = 229;

/**
 * Enter and Cmd/Ctrl+Enter submit; Shift+Enter inserts a newline; an active IME
 * composition never submits, so confirming a candidate with Enter only commits
 * the composed text.
 */
export function resolveComposerKeyIntent(
  press: ComposerKeyPress
): ComposerKeyIntent {
  if (press.key !== 'Enter') {
    return 'none';
  }
  if (press.isComposing || press.keyCode === IME_PROCESSING_KEY_CODE) {
    return 'none';
  }
  if (press.metaKey || press.ctrlKey) {
    return 'submit';
  }
  if (press.shiftKey || press.altKey) {
    return 'none';
  }
  return 'submit';
}
