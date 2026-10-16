import type { ReactNode } from 'react';
import './popover.css';

/**
 * `list` is the rows surface (provider, model, project); `panel` is the wider
 * padded surface the effort and environment controls draw; `wide` is the wide
 * rows surface the approval levels need for their descriptions
 * (`docs/wireframes/10-approval-mode.html`).
 */
export type PopoverVariant = 'list' | 'panel' | 'wide';

export interface PopoverProps {
  /** Muted heading drawn above the content. */
  readonly header?: string;
  /** Muted note drawn under the content. */
  readonly footer?: string;
  readonly variant?: PopoverVariant;
  readonly children: ReactNode;
}

/**
 * Molecule: the shared floating surface behind every composer selector — one
 * component, different content (`docs/wireframes/README.md`, "Reusable
 * components": "Popover / Select — One component, different content"). It draws
 * no placement of its own: the composer organism positions it above the box, so
 * no outer `position` lives on this molecule.
 */
export function Popover({
  header,
  footer,
  variant = 'list',
  children
}: PopoverProps) {
  return (
    <div className={`popover popover--${variant}`}>
      {header ? <p className="popover__header">{header}</p> : null}
      {children}
      {footer ? <p className="popover__footer">{footer}</p> : null}
    </div>
  );
}
