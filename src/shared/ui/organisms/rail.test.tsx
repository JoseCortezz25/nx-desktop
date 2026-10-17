import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { getSharedMessages } from '@/shared/i18n/messages';
import { IconButton, type IconButtonProps } from '../molecules/icon-button';
import { Rail, type RailProps } from './rail';

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

/** The rail's props; each test overrides only the values it asserts. */
function railProps(): RailProps {
  return {
    isSidebarOpen: false,
    isRightPanelOpen: false,
    onNavigateHome: () => undefined,
    onToggleSidebar: () => undefined,
    onToggleRightPanel: () => undefined
  };
}

describe('rail', () => {
  it('draws the home destination as the current navigation entry', () => {
    const markup = renderToStaticMarkup(<Rail {...railProps()} />);

    expect(markup).toContain('class="rail"');
    expect(markup).toContain(
      `aria-label="${getSharedMessages().rail.homeLabel}"`
    );
    expect(markup).toContain('aria-current="page"');
  });

  it('wires the home entry to the navigation action the shell hands down', () => {
    const onNavigateHome = vi.fn();
    const buttons = collectIconButtons(
      Rail({ ...railProps(), onNavigateHome })
    );

    // The home icon is the rail's only navigation entry; pressing it must
    // report the home destination so the shell clears the open conversation
    // (#40, criterion 1).
    const home = buttons.find(button => button.props.icon === 'home');
    expect(home).toBeDefined();

    home?.props.onPress?.();

    expect(onNavigateHome).toHaveBeenCalledTimes(1);
  });

  it('draws the two region toggles the native frame no longer owns', () => {
    // #42: the OS draws the window frame and its controls, so the two region
    // toggles — real application state, not chrome — moved into the rail, the
    // app's own navigation surface.
    const markup = renderToStaticMarkup(<Rail {...railProps()} />);
    const messages = getSharedMessages();

    expect(markup).toContain(
      `aria-label="${messages.rail.toggleSidebarLabel}"`
    );
    expect(markup).toContain(
      `aria-label="${messages.rail.toggleRightPanelLabel}"`
    );
  });

  it('reports each region toggle and reflects the region it controls', () => {
    const onToggleSidebar = vi.fn();
    const onToggleRightPanel = vi.fn();
    const buttons = collectIconButtons(
      Rail({
        ...railProps(),
        isSidebarOpen: true,
        isRightPanelOpen: false,
        onToggleSidebar,
        onToggleRightPanel
      })
    );

    const sidebarToggle = buttons.find(
      button => button.props.icon === 'panel-left'
    );
    const rightPanelToggle = buttons.find(
      button => button.props.icon === 'panel-right'
    );
    expect(sidebarToggle).toBeDefined();
    expect(rightPanelToggle).toBeDefined();

    // Each toggle carries its own region's pressed state, never the other's.
    expect(sidebarToggle?.props.isPressed).toBe(true);
    expect(rightPanelToggle?.props.isPressed).toBe(false);

    sidebarToggle?.props.onPress?.();
    rightPanelToggle?.props.onPress?.();

    expect(onToggleSidebar).toHaveBeenCalledTimes(1);
    expect(onToggleRightPanel).toHaveBeenCalledTimes(1);
  });
});
