import type { ReactNode } from 'react';
import { getSharedMessages } from '@/shared/i18n/messages';
import { IconButton } from '../molecules/icon-button';
import './right-panel.css';

export interface RightPanelProps {
  /**
   * Whether the region is shown. Visibility is owned by the shell; this frame
   * only reflects it through the `hidden` attribute, so the region's content
   * stays mounted (and keeps its state) while it is closed.
   */
  readonly isOpen?: boolean;
  readonly onClose: () => void;
  /** Tab strip slot (#13, #18). */
  readonly tabs?: ReactNode;
  /** Viewer slot: `DocumentView`, `CodeView`, or `DiffView` (#13, #18). */
  readonly children?: ReactNode;
}

/**
 * Organism: the toggleable right panel region (`docs/wireframes/README.md`,
 * "Layout regions"). It ships the region frame — tab strip and close action —
 * and reserves the viewer slot the file and diff tickets fill.
 *
 * `isOpen` hides the frame without unmounting it, so a region that must keep
 * state across a close/reopen (the file panel's open tabs) survives. The
 * `hidden` attribute takes the frame out of layout and the accessibility tree,
 * and the stylesheet re-applies `display: none` so the region's own `flex`
 * display cannot override it.
 */
export function RightPanel({
  isOpen = true,
  onClose,
  tabs,
  children
}: RightPanelProps) {
  const messages = getSharedMessages();

  return (
    <aside className="right-panel" hidden={!isOpen}>
      <div className="right-panel__tabs">
        <div className="right-panel__tab-slot">{tabs}</div>
        <IconButton
          icon="close"
          label={messages.rightPanel.closeLabel}
          size="sm"
          onPress={onClose}
        />
      </div>
      <div className="right-panel__content">{children}</div>
    </aside>
  );
}
