import type { Provider } from '@/shared/domain/provider.types';
import { getSharedMessages } from '@/shared/i18n/messages';
import { Composer } from './composer';
import './home-view.css';

export interface HomeViewProps {
  /**
   * Provider catalog resolved by the shell root through the typed provider port.
   * The composer's selectors read it; empty while the catalog loads.
   */
  readonly providers: readonly Provider[];
  /** Handed the prompt the user submitted from the composer. */
  readonly onSubmit: (prompt: string) => void;
}

/**
 * Organism: the home view that fills the main pane on screen 01
 * (`docs/wireframes/README.md`, "Screen index" — "Home, no sidebar, empty
 * composer"). It owns the title and the composer; the context bar and the
 * suggestion rows drawn in the wireframe are surfaces of other tickets or have
 * no specified copy yet, so they are deliberately absent here.
 */
export function HomeView({ providers, onSubmit }: HomeViewProps) {
  const messages = getSharedMessages();

  return (
    <section className="home-view">
      <h1 className="home-view__title">{messages.home.title}</h1>
      <Composer providers={providers} onSubmit={onSubmit} />
    </section>
  );
}
