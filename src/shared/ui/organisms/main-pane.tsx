import type { ReactNode } from 'react';
import './main-pane.css';

export interface MainPaneProps {
  /** Content slot: the home view or the active conversation (#6, #11-#13). */
  readonly children?: ReactNode;
}

/**
 * Organism: the main pane region (`docs/wireframes/README.md`, "Layout
 * regions"). The region is built here; the home view and the composer that fill
 * it belong to #6.
 */
export function MainPane({ children }: MainPaneProps) {
  return <main className="main-pane">{children}</main>;
}
