import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ConversationRow } from './conversation-row';

describe('conversation row', () => {
  it('renders the title and marks the active conversation', () => {
    const active = renderToStaticMarkup(
      <ConversationRow
        title="Diff review panel"
        isActive
        onSelect={() => undefined}
      />
    );
    const inactive = renderToStaticMarkup(
      <ConversationRow
        title="Diff review panel"
        isActive={false}
        onSelect={() => undefined}
      />
    );

    expect(active).toContain(
      '<span class="conversation-row__title">Diff review panel</span>'
    );
    expect(active).toContain('button--active');
    expect(active).toContain('aria-current="page"');
    expect(inactive).not.toContain('button--active');
    expect(inactive).not.toContain('aria-current');
  });

  it('forwards the row press to onSelect', () => {
    const onSelect = vi.fn();
    const element = ConversationRow({
      title: 'Diff review panel',
      isActive: false,
      onSelect
    });

    element.props.onPress?.();

    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
