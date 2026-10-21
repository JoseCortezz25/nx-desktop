import { describe, expect, it } from 'vitest';
import {
  EMPTY_COMPOSER_DRAFT,
  isSubmittable,
  resolveComposerKeyIntent,
  type ComposerKeyPress,
  submitDraft,
  submitDraftWithSelection,
  typeInDraft
} from './composer-draft';

/**
 * Covers the ticket's first acceptance criterion at the seam the component uses:
 * typing builds a draft, and submitting hands that draft's text to the callback.
 * The rule lives here rather than inside JSX because the test runner has no DOM.
 */
describe('composer draft', () => {
  it('carries the typed text into the draft', () => {
    expect(typeInDraft('Fix the flaky test')).toEqual({
      text: 'Fix the flaky test'
    });
  });

  it('hands the typed text to the submit callback', () => {
    const submitted: string[] = [];

    const typed = typeInDraft('Write the composer test');
    const afterSubmit = submitDraft(typed, text => submitted.push(text));

    expect(submitted).toEqual(['Write the composer test']);
    expect(afterSubmit).toEqual(EMPTY_COMPOSER_DRAFT);
  });

  it('treats only non-whitespace drafts as submittable', () => {
    expect(isSubmittable(EMPTY_COMPOSER_DRAFT)).toBe(false);
    expect(isSubmittable(typeInDraft('   '))).toBe(false);
    expect(isSubmittable(typeInDraft('hola'))).toBe(true);
  });

  it('does not submit an empty draft and keeps it untouched', () => {
    let calls = 0;

    const afterSubmit = submitDraft(EMPTY_COMPOSER_DRAFT, () => {
      calls += 1;
    });

    expect(calls).toBe(0);
    expect(afterSubmit).toBe(EMPTY_COMPOSER_DRAFT);
  });
});

describe('submitDraftWithSelection', () => {
  it('blocks the send and keeps the draft while no provider is selected', () => {
    const draft = typeInDraft('Keep me');
    let calls = 0;

    const afterSubmit = submitDraftWithSelection(draft, false, () => {
      calls += 1;
    });

    expect(calls).toBe(0);
    expect(afterSubmit).toBe(draft);
  });

  it('submits and empties the draft once a selection exists', () => {
    const submitted: string[] = [];

    const afterSubmit = submitDraftWithSelection(
      typeInDraft('Ship it'),
      true,
      text => submitted.push(text)
    );

    expect(submitted).toEqual(['Ship it']);
    expect(afterSubmit).toBe(EMPTY_COMPOSER_DRAFT);
  });
});

/** A bare Enter press; each case overrides only what it exercises. */
function press(overrides: Partial<ComposerKeyPress> = {}): ComposerKeyPress {
  return {
    key: 'Enter',
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    isComposing: false,
    keyCode: 13,
    ...overrides
  };
}

describe('resolveComposerKeyIntent', () => {
  it('submits on Enter', () => {
    expect(resolveComposerKeyIntent(press())).toBe('submit');
  });

  it('submits on Cmd+Enter and Ctrl+Enter', () => {
    expect(resolveComposerKeyIntent(press({ metaKey: true }))).toBe('submit');
    expect(resolveComposerKeyIntent(press({ ctrlKey: true }))).toBe('submit');
  });

  it('leaves Shift+Enter to insert a newline', () => {
    expect(resolveComposerKeyIntent(press({ shiftKey: true }))).toBe('none');
  });

  it('never submits while an IME composition is active', () => {
    expect(resolveComposerKeyIntent(press({ isComposing: true }))).toBe('none');
    expect(resolveComposerKeyIntent(press({ keyCode: 229 }))).toBe('none');
    expect(
      resolveComposerKeyIntent(press({ isComposing: true, metaKey: true }))
    ).toBe('none');
  });

  it('ignores every key other than Enter', () => {
    expect(resolveComposerKeyIntent(press({ key: 'a', keyCode: 65 }))).toBe(
      'none'
    );
    expect(
      resolveComposerKeyIntent(press({ key: 'a', keyCode: 65, metaKey: true }))
    ).toBe('none');
  });

  it('keeps the draft when an Enter submit is blocked by a missing selection', () => {
    const draft = typeInDraft('Keep me on Enter');
    let calls = 0;

    const afterEnter =
      resolveComposerKeyIntent(press()) === 'submit'
        ? submitDraftWithSelection(draft, false, () => {
            calls += 1;
          })
        : draft;

    expect(calls).toBe(0);
    expect(afterEnter).toBe(draft);
  });
});
