import type { ReactNode } from 'react';
import { getSharedMessages } from '@/shared/i18n/messages';
import { IconButton } from '../molecules/icon-button';
import './right-panel.css';

export interface RightPanelProps {
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
 */
export function RightPanel({ onClose, tabs, children }: RightPanelProps) {
  const messages = getSharedMessages();

  return (
    <aside className="right-panel">
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
