import { getSharedMessages } from '@/shared/i18n/messages';
import { IconButton } from '../molecules/icon-button';
import './rail.css';

export interface RailProps {
  /** Reports the home destination press; the shell clears the open conversation. */
  readonly onNavigateHome: () => void;
  /** Whether the sidebar region is open, for the toggle's pressed state. */
  readonly isSidebarOpen: boolean;
  /** Whether the right panel region is open, for the toggle's pressed state. */
  readonly isRightPanelOpen: boolean;
  /** Reports the sidebar toggle press; the shell flips that one region. */
  readonly onToggleSidebar: () => void;
  /** Reports the right-panel toggle press; the shell flips that one region. */
  readonly onToggleRightPanel: () => void;
}

/**
 * Organism: the icon rail region (`docs/wireframes/README.md`, "Layout
 * regions"). Only the home destination ships with the shell; the remaining rail
 * icons are drawn for fidelity and are explicitly out of scope
 * (`docs/wireframes/README.md`, "Ground rules for implementation").
 *
 * The home entry is the one live navigation destination: it reports the press
 * upward so the shell returns to the home view and clears the open
 * conversation, instead of being an inert icon.
 *
 * The two region toggles live here since #42. The drawn title bar that used to
 * hold them was removed because the OS draws the window frame; the toggles are
 * real application state (region visibility), not window chrome, so they moved
 * into the rail — the app's own navigation surface — instead of being deleted
 * with the frame. They report presses up and read the visibility the shell owns;
 * this organism keeps no state and calls no IPC.
 */
export function Rail({
  onNavigateHome,
  isSidebarOpen,
  isRightPanelOpen,
  onToggleSidebar,
  onToggleRightPanel
}: RailProps) {
  const messages = getSharedMessages();

  return (
    <nav className="rail" aria-label={messages.rail.navigationLabel}>
      <IconButton
        icon="home"
        label={messages.rail.homeLabel}
        size="lg"
        isActive
        isCurrent
        onPress={onNavigateHome}
      />
      <span className="rail__separator" aria-hidden="true" />
      <IconButton
        icon="panel-left"
        label={messages.rail.toggleSidebarLabel}
        size="lg"
        isActive={isSidebarOpen}
        isPressed={isSidebarOpen}
        onPress={onToggleSidebar}
      />
      <IconButton
        icon="panel-right"
        label={messages.rail.toggleRightPanelLabel}
        size="lg"
        isActive={isRightPanelOpen}
        isPressed={isRightPanelOpen}
        onPress={onToggleRightPanel}
      />
      <span className="rail__avatar" aria-hidden="true" />
    </nav>
  );
}
