import { describe, expect, it } from 'vitest';
import {
  EMPTY_COMPOSER_DRAFT,
  isSubmittable,
  submitDraft,
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
