import type { ReactNode } from 'react';
import './sidebar-section.css';

export interface SidebarSectionProps {
  /** Group heading drawn above the rows ("Fijados", "Proyectos", "Recientes"). */
  readonly label: string;
  readonly children: ReactNode;
}

/**
 * Molecule: a labelled group of sidebar rows (`docs/wireframes/02-home-sidebar.html`,
 * `.group`). It owns the heading rhythm; the organism owns the section's own
 * placement in the scroll container.
 */
export function SidebarSection({ label, children }: SidebarSectionProps) {
  return (
    <section className="sidebar-section">
      <p className="sidebar-section__label">{label}</p>
      <div className="sidebar-section__body">{children}</div>
    </section>
  );
}
