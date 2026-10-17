import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
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
  /**
   * Whether the region is drawn as an on-demand overlay over the main pane
   * instead of a fixed column (the narrow-window arrangement, #43). An overlay
   * is dismissible (Escape or the close control), moves focus into itself when
   * it opens and restores it when it closes, and never covers the composer/send
   * — the drawer ends above the composer (`--composer-clearance`) and the
   * composer dock also paints above it (`--layer-composer`).
   *
   * It is a presentation mode only: the region's `visibility` state and its
   * mounted content (the open-tab working set) are untouched, so an
   * overlay/column switch never discards either.
   */
  readonly isOverlay?: boolean;
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
 *
 * `isOverlay` re-frames the same mounted region as a dismissible drawer: it
 * focuses itself on open, restores the previous focus on close, and closes on
 * Escape. The keydown is handled on the frame, not the document, so Escape
 * dismisses whichever surface the user is actually in — the composer's own
 * popovers keep their Escape handling.
 */
export function RightPanel({
  isOpen = true,
  isOverlay = false,
  onClose,
  tabs,
  children
}: RightPanelProps) {
  const messages = getSharedMessages();
  const frameRef = useRef<HTMLElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Synchronizes focus with the overlay lifecycle: into the frame when the
  // region opens, back to whatever opened it when it closes. The frame is never
  // unmounted, so the effect owns both directions.
  useEffect(() => {
    if (!isOverlay) {
      return;
    }

    if (isOpen) {
      const active = document.activeElement;
      restoreFocusRef.current = active instanceof HTMLElement ? active : null;
      frameRef.current?.focus();
      return;
    }

    restoreFocusRef.current?.focus();
    restoreFocusRef.current = null;
  }, [isOpen, isOverlay]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (isOverlay && event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  }

  return (
    <aside
      ref={frameRef}
      className={isOverlay ? 'right-panel right-panel--overlay' : 'right-panel'}
      hidden={!isOpen}
      tabIndex={isOverlay ? -1 : undefined}
      onKeyDown={handleKeyDown}
    >
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
