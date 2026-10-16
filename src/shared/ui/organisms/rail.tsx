import { getSharedMessages } from '@/shared/i18n/messages';
import { IconButton } from '../molecules/icon-button';
import './rail.css';

/**
 * Organism: the icon rail region (`docs/wireframes/README.md`, "Layout
 * regions"). Only the home destination ships with the shell; the remaining rail
 * icons are drawn for fidelity and are explicitly out of scope
 * (`docs/wireframes/README.md`, "Ground rules for implementation").
 */
export function Rail() {
  const messages = getSharedMessages();

  return (
    <nav className="rail" aria-label={messages.rail.navigationLabel}>
      <IconButton
        icon="home"
        label={messages.rail.homeLabel}
        size="lg"
        isActive
        isCurrent
      />
      <span className="rail__separator" aria-hidden="true" />
      <span className="rail__avatar" aria-hidden="true" />
    </nav>
  );
}
