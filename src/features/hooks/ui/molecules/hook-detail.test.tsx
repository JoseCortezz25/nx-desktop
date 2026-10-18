import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getHookMessages } from '../../messages';
import { HookDetail } from './hook-detail';

describe('hook detail', () => {
  it('renders the four labelled provider values and a fractional timeout', () => {
    const messages = getHookMessages().hookReview;
    const markup = renderToStaticMarkup(
      <HookDetail
        hook={{
          id: 'hook-guard',
          name: 'Guard',
          isNew: true,
          origin: 'Complemento',
          hookType: 'PreToolUse',
          command: 'node hooks/guard.mjs --check',
          timeoutMs: 1500,
          approvalStatus: 'pending'
        }}
      />
    );
    for (const label of [
      messages.originLabel,
      messages.hookTypeLabel,
      messages.commandLabel,
      messages.timeoutLabel
    ])
      expect(markup).toContain(`<dt>${label}</dt>`);
    expect(markup).toContain('Complemento');
    expect(markup).toContain('PreToolUse');
    expect(markup).toContain(
      '<code class="hook-detail__command">node hooks/guard.mjs --check</code>'
    );
    expect(markup).toContain('1.5 s');
    expect(markup).not.toContain('<button');
  });
});
