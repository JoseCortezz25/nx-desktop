import { getSharedMessages } from '@/shared/i18n/messages';
import { IconButton } from '../molecules/icon-button';
import './rail.css';

export interface RailProps {
  /** Reports the home destination press; the shell clears the open conversation. */
  readonly onNavigateHome: () => void;
}

/**
 * Organism: the icon rail region (`docs/wireframes/README.md`, "Layout
 * regions"). Only the home destination ships with the shell; the remaining rail
 * icons are drawn for fidelity and are explicitly out of scope
 * (`docs/wireframes/README.md`, "Ground rules for implementation").
 *
 * The home entry is the one live destination: it reports the press upward so
 * the shell returns to the home view and clears the open conversation, instead
 * of being an inert icon.
 */
export function Rail({ onNavigateHome }: RailProps) {
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
      <span className="rail__avatar" aria-hidden="true" />
    </nav>
  );
}
