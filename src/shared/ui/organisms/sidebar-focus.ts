/**
 * The structural slice of a DOM node the focus-restore decision reads. Kept
 * structural (not `HTMLElement`) so the rule is a pure function the node-only
 * test runner can drive without a DOM.
 */
export interface FocusContainer {
  contains(node: unknown): boolean;
}

export interface FocusRestoreCandidate {
  /** `false` once the node has left the document, e.g. the rail re-rendered. */
  readonly isConnected: boolean;
}

/**
 * Decides where focus goes when the overlay sidebar drawer closes (#51).
 *
 * It must be asked while the drawer is still mounted — before the Escape close
 * unmounts it, or from a cleanup that runs before the node is removed — because
 * once the focused drawer leaves the document the browser has already moved
 * focus to `document.body`, and "was focus inside the drawer?" can no longer be
 * answered. That was the #51 defect.
 *
 * Returns the control that opened the drawer (the rail toggle) when focus is
 * still inside the drawer and that control is still in the document; otherwise
 * `null`, so a close never steals focus the user already moved elsewhere and
 * never targets a detached node.
 */
export function resolveSidebarFocusRestore<T extends FocusRestoreCandidate>(
  restoreTarget: T | null,
  drawer: FocusContainer | null,
  activeElement: unknown
): T | null {
  if (restoreTarget === null || drawer === null) {
    return null;
  }

  if (!restoreTarget.isConnected || drawer.contains(restoreTarget)) {
    return null;
  }

  return drawer.contains(activeElement) ? restoreTarget : null;
}
