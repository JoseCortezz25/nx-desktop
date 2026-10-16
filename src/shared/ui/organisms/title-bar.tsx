import { getSharedMessages } from '@/shared/i18n/messages';
import { IconButton } from '../molecules/icon-button';
import { MenuBar } from '../molecules/menu-bar';
import { NavHistory } from '../molecules/nav-history';
import { WindowControls } from '../molecules/window-controls';
import './title-bar.css';

export interface TitleBarProps {
  readonly isSidebarOpen: boolean;
  readonly isRightPanelOpen: boolean;
  readonly onToggleSidebar: () => void;
  readonly onToggleRightPanel: () => void;
}

/**
 * Organism: the title bar region (`docs/wireframes/README.md`, "Layout
 * regions"). It owns layout only; the menu labels come from the shared message
 * map and the region toggles are driven by the shell root.
 */
export function TitleBar({
  isSidebarOpen,
  isRightPanelOpen,
  onToggleSidebar,
  onToggleRightPanel
}: TitleBarProps) {
  const messages = getSharedMessages();
  const menuItems = [
    { id: 'file', label: messages.window.menus.file },
    { id: 'edit', label: messages.window.menus.edit },
    { id: 'view', label: messages.window.menus.view },
    { id: 'help', label: messages.window.menus.help }
  ];

  return (
    <header className="title-bar">
      <div className="title-bar__nav">
        <NavHistory
          backLabel={messages.window.navigation.backLabel}
          forwardLabel={messages.window.navigation.forwardLabel}
        />
        <IconButton
          icon="panel-left"
          label={messages.window.navigation.toggleSidebarLabel}
          size="sm"
          isActive={isSidebarOpen}
          isPressed={isSidebarOpen}
          onPress={onToggleSidebar}
        />
        <IconButton
          icon="panel-right"
          label={messages.window.navigation.toggleRightPanelLabel}
          size="sm"
          isActive={isRightPanelOpen}
          isPressed={isRightPanelOpen}
          onPress={onToggleRightPanel}
        />
      </div>
      <div className="title-bar__menus">
        <MenuBar items={menuItems} />
      </div>
      <div className="title-bar__controls">
        <WindowControls labels={messages.window.controls} />
      </div>
    </header>
  );
}
