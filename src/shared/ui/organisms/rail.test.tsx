import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { getSharedMessages } from '@/shared/i18n/messages';
import { IconButton, type IconButtonProps } from '../molecules/icon-button';
import { Rail } from './rail';

/** Collects the `IconButton` molecules a rail render produced (no DOM needed). */
function collectIconButtons(node: ReactNode): ReactElement<IconButtonProps>[] {
  const found: ReactElement<IconButtonProps>[] = [];

  function visit(current: ReactNode) {
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (!isValidElement(current)) {
      return;
    }
    if (current.type === IconButton) {
      found.push(current as ReactElement<IconButtonProps>);
      return;
    }
    visit((current.props as { children?: ReactNode }).children);
  }

  visit(node);
  return found;
}

describe('rail', () => {
  it('draws the home destination as the current navigation entry', () => {
    const markup = renderToStaticMarkup(
      <Rail onNavigateHome={() => undefined} />
    );

    expect(markup).toContain('class="rail"');
    expect(markup).toContain(
      `aria-label="${getSharedMessages().rail.homeLabel}"`
    );
    expect(markup).toContain('aria-current="page"');
  });

  it('wires the home entry to the navigation action the shell hands down', () => {
    const onNavigateHome = vi.fn();
    const buttons = collectIconButtons(Rail({ onNavigateHome }));

    // The home icon is the rail's only interactive entry; pressing it must
    // report the home destination so the shell clears the open conversation
    // (#40, criterion 1).
    const home = buttons.find(button => button.props.icon === 'home');
    expect(home).toBeDefined();

    home?.props.onPress?.();

    expect(onNavigateHome).toHaveBeenCalledTimes(1);
  });
});
