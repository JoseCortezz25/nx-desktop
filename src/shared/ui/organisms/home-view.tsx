import type { ReactNode } from 'react';
import { getSharedMessages } from '@/shared/i18n/messages';
import './home-view.css';

export interface HomeViewProps {
  /**
   * The composer dock. The shell composes it once and slots it here, so the
   * home view and the conversation view share one composer instance and one
   * owner of the composer's state.
   */
  readonly composer?: ReactNode;
}

/**
 * Organism: the home view that fills the main pane on screen 01
 * (`docs/wireframes/README.md`, "Screen index" — "Home, no sidebar, empty
 * composer"). It owns the title and the slot the composer docks into; the
 * suggestion rows drawn in the wireframe have no specified copy yet, so they are
 * deliberately absent here.
 */
export function HomeView({ composer }: HomeViewProps) {
  const messages = getSharedMessages();

  return (
    <section className="home-view">
      <h1 className="home-view__title">{messages.home.title}</h1>
      {composer}
    </section>
  );
}
