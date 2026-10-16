import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { APPROVAL_MODES } from '@/shared/domain/approval-mode.types';
import { getApprovalModeCopy } from '@/shared/i18n/messages';
import { ApprovalModePicker } from './approval-mode-picker';

describe('approval mode picker', () => {
  it('offers exactly the three levels the domain documents', () => {
    const markup = renderToStaticMarkup(
      <ApprovalModePicker
        label="Modos de aprobación"
        selectedMode="ask_always"
        onSelect={() => undefined}
      />
    );

    expect(APPROVAL_MODES).toEqual([
      'ask_always',
      'auto_approve',
      'full_access'
    ]);
    for (const mode of APPROVAL_MODES) {
      expect(markup).toContain(
        `aria-label="${getApprovalModeCopy(mode).label}"`
      );
    }
    expect(markup.match(/role="option"/g)?.length).toBe(APPROVAL_MODES.length);
  });

  it('draws every level with its own description and glyph', () => {
    const markup = renderToStaticMarkup(
      <ApprovalModePicker
        label="Modos de aprobación"
        selectedMode="ask_always"
        onSelect={() => undefined}
      />
    );

    for (const mode of APPROVAL_MODES) {
      expect(markup).toContain(getApprovalModeCopy(mode).description);
    }
  });

  it('marks only the selected level as the current one', () => {
    const markup = renderToStaticMarkup(
      <ApprovalModePicker
        label="Modos de aprobación"
        selectedMode="auto_approve"
        onSelect={() => undefined}
      />
    );

    expect(markup.match(/aria-selected="true"/g)?.length).toBe(1);
    expect(markup).toContain(
      `aria-label="${getApprovalModeCopy('auto_approve').label}" aria-selected="true"`
    );
  });

  it('carries the warning tone on the unrestricted level only', () => {
    const markup = renderToStaticMarkup(
      <ApprovalModePicker
        label="Modos de aprobación"
        selectedMode="ask_always"
        onSelect={() => undefined}
      />
    );

    expect(markup.match(/button--warn/g)?.length).toBe(1);
    expect(markup).toContain(
      `aria-label="${getApprovalModeCopy('full_access').label}"`
    );
  });
});
