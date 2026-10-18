import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import { Button } from '../atoms/button';
import { Icon } from '../atoms/icon';
import './dialog.css';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

function getActiveElement(): HTMLElement | null {
  return typeof document !== 'undefined' &&
    document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
}

function getExpandedTrigger(): HTMLElement | null {
  return typeof document !== 'undefined'
    ? document.querySelector<HTMLElement>('[aria-expanded="true"]')
    : null;
}

function getFocusableElements(dialog: HTMLDivElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

export interface DialogProps {
  /** Accessible name of the modal, drawn as its heading. */
  readonly title: string;
  /** Accessible name for the close control. */
  readonly closeLabel: string;
  /** Reports the dismissal the shell performs; the caller owns the open state. */
  readonly onClose: () => void;
  /**
   * Surface width. `default` is the 572px create-project dialog (screens 05/06);
   * `wide` is the 748px review dialog screens 14/15 draw, which needs the room for
   * a note plus three actions on one line.
   */
  readonly size?: 'default' | 'wide';
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
export function Dialog({
  title,
  closeLabel,
  onClose,
  size = 'default',
  children
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Rendering happens before the composer removes the popover action that opened
  // the dialog. Capture it here, rather than in the mount effect, so a detached
  // action cannot erase the return target. The expanded selector is a connected
  // fallback for a transient popover action whose owning trigger stays mounted.
  const restoreFocusRef = useRef(getActiveElement());
  const expandedTriggerRef = useRef(getExpandedTrigger());
  // The dismissal handler is kept in a ref so the mount effect below can stay
  // dependency-free: re-running it on every render would re-focus the dialog at
  // every keystroke, stealing focus from the field the user is typing in.
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Synchronizes with the document while the dialog is mounted: move focus into
  // the modal, contain Tab navigation, dismiss on Escape, and put focus back
  // where it was on unmount. The effect has no dependencies so typing never
  // re-focuses the field.
  useEffect(() => {
    const dialog = dialogRef.current;
    const focusableElements = dialog ? getFocusableElements(dialog) : [];
    (focusableElements[0] ?? dialog)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab' || !dialog) {
        return;
      }

      const focusable = getFocusableElements(dialog);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (!first || !last) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const activeElement = getActiveElement();
      const isFocusInsideDialog =
        activeElement !== null && dialog.contains(activeElement);

      if (
        (event.shiftKey && (!isFocusInsideDialog || activeElement === first)) ||
        (!event.shiftKey && (activeElement === last || !isFocusInsideDialog))
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const activeElement = getActiveElement();
      const hasFocusedOutsideDialog =
        activeElement !== null &&
        activeElement !== document.body &&
        activeElement.isConnected &&
        !dialog?.contains(activeElement);

      // Do not override a focus move made by the close interaction. When React
      // has already detached the focused dialog control, browsers expose body as
      // active; return to the original opener, or the still-mounted expanded
      // trigger that owned a transient popover action.
      if (!hasFocusedOutsideDialog) {
        const restoreTarget = restoreFocusRef.current?.isConnected
          ? restoreFocusRef.current
          : expandedTriggerRef.current?.isConnected
            ? expandedTriggerRef.current
            : null;
        restoreTarget?.focus();
      }
    };
  }, []);

  function handleBackdropPress(event: MouseEvent<HTMLDivElement>) {
    // Presses that start on the backdrop dismiss; presses inside the surface do
    // not bubble a dismissal, so a drag that ends outside cannot close the form.
    if (event.target === event.currentTarget) {
      // Closing on mousedown is intentional: it makes the backdrop the only
      // hit target and avoids an inside-to-outside drag dismissing the form.
      // Cancel its native focus action before unmount so it cannot replace the
      // cleanup's deterministic return focus target with document.body.
      event.preventDefault();
      onClose();
    }
  }

  return (
    <div className="dialog-overlay" onMouseDown={handleBackdropPress}>
      <div
        ref={dialogRef}
        className={size === 'wide' ? 'dialog dialog--wide' : 'dialog'}
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
