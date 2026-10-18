import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import { Button } from '../atoms/button';
import { Icon } from '../atoms/icon';
import './dialog.css';

export interface DialogProps {
  /** Accessible name of the modal, drawn as its heading. */
  readonly title: string;
  /** Accessible name for the close control. */
  readonly closeLabel: string;
  /** Reports the dismissal the shell performs; the caller owns the open state. */
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/**
 * Molecule: the shared modal surface (`docs/wireframes/README.md`, "Reusable
 * components": `Dialog` — "Title, close, body, footer actions"; screens 05/06
 * and the hooks modals 14/15).
 *
 * Unlike `Popover` — which deliberately draws no placement because the composer
 * anchors it to a chip — a modal *is* the placement: a modal that a parent could
 * position arbitrarily would stop being modal, so this molecule owns the
 * viewport-covering overlay, the centred surface and the dismissal behaviour it
 * publishes upward through `onClose`.
 *
 * It holds no product state and knows no domain type: the caller owns whether the
 * dialog is open, and every string it draws — including the close label — is
 * handed in. The dismissal paths (`Escape`, backdrop press, the close control)
 * only report; the caller decides.
 */
export function Dialog({ title, closeLabel, onClose, children }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // The dismissal handler is kept in a ref so the mount effect below can stay
  // dependency-free: re-running it on every render would re-focus the dialog at
  // every keystroke, stealing focus from the field the user is typing in.
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Synchronizes with the document while the dialog is mounted: move focus into
  // the modal, dismiss on Escape, and put focus back where it was on unmount.
  // Cleanup is idempotent.
  useEffect(() => {
    const dialog = dialogRef.current;
    const restore =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCloseRef.current();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Only reclaim focus if it is still inside a dialog that is going away, so
      // a dialog closed while the user moved focus elsewhere never steals it.
      if (restore && !dialog?.contains(document.activeElement)) {
        restore.focus();
      }
    };
  }, []);

  function handleBackdropPress(event: MouseEvent<HTMLDivElement>) {
    // Presses that start on the backdrop dismiss; presses inside the surface do
    // not bubble a dismissal, so a drag that ends outside cannot close the form.
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  return (
    <div className="dialog-overlay" onMouseDown={handleBackdropPress}>
      <div
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="dialog__header">
          <h2 className="dialog__title">{title}</h2>
          <Button variant="icon" label={closeLabel} onPress={onClose}>
            <Icon name="close" size="sm" />
          </Button>
        </div>
        <div className="dialog__body">{children}</div>
      </div>
    </div>
  );
}
