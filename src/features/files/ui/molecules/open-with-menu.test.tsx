import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getSharedMessages } from '@/shared/i18n/messages';
import { OpenWithMenu } from './open-with-menu';

describe('open with menu', () => {
  it('draws nothing when no target is offered', () => {
    const markup = renderToStaticMarkup(
      <OpenWithMenu
        items={[]}
        isExpanded={false}
        onOpenPrimary={() => undefined}
        onToggle={() => undefined}
      />
    );

    expect(markup).toBe('');
  });

  it('draws the split control from the shared copy', () => {
    const messages = getSharedMessages();
    const markup = renderToStaticMarkup(
      <OpenWithMenu
        items={[{ target: 'editor' }]}
        isExpanded={true}
        onOpenPrimary={() => undefined}
        onToggle={() => undefined}
      />
    );

    expect(markup).toContain(messages.fileViewer.openMenu.triggerLabel);
    expect(markup).toContain(
      `aria-label="${messages.fileViewer.openMenu.menuLabel}"`
    );
    expect(markup).toContain('aria-expanded="true"');
  });
});
