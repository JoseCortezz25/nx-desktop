/**
 * Visibility state of the toggleable window-shell regions.
 *
 * The sidebar and the right panel are ephemeral presentation state owned by the
 * shell composition root (`docs/wireframes/README.md`, "Layout regions"). This
 * module keeps the transition pure and testable so the root only wires it to
 * React state and never encodes the toggle rule inline.
 */
export const SHELL_REGIONS = ['sidebar', 'rightPanel'] as const;

/** A region that the shell can open and close. */
export type ShellRegion = (typeof SHELL_REGIONS)[number];

export interface RegionVisibility {
  readonly sidebar: boolean;
  readonly rightPanel: boolean;
}

/**
 * Both toggleable regions start closed, which is the state screen 01 draws
 * ("Home, no sidebar").
 */
export const INITIAL_REGION_VISIBILITY: RegionVisibility = {
  sidebar: false,
  rightPanel: false
};

/** Returns `true` when the region is currently open. */
export function isRegionOpen(
  visibility: RegionVisibility,
  region: ShellRegion
): boolean {
  return visibility[region];
}

/**
 * Flips one region without touching the other. Returns a new object; the input
 * is never mutated, so it can be used directly as a React state updater.
 */
export function toggleRegion(
  visibility: RegionVisibility,
  region: ShellRegion
): RegionVisibility {
  if (region === 'sidebar') {
    return { ...visibility, sidebar: !visibility.sidebar };
  }
  return { ...visibility, rightPanel: !visibility.rightPanel };
}

/**
 * Makes one region visible without touching the other. Unlike `toggleRegion`
 * this is idempotent: an already-open region yields the same object instead of
 * closing it, so a caller that *reveals* a region can never accidentally hide
 * it. That is the transition the right panel needs when a file chip asks it to
 * open (`docs/wireframes/README.md`, "opens on file or diff click").
 */
export function showRegion(
  visibility: RegionVisibility,
  region: ShellRegion
): RegionVisibility {
  if (region === 'sidebar') {
    return visibility.sidebar ? visibility : { ...visibility, sidebar: true };
  }
  return visibility.rightPanel
    ? visibility
    : { ...visibility, rightPanel: true };
}

/**
 * How an open region is presented at a given window width.
 *
 * - `inline`: the region keeps a fixed column in the shell's flex row.
 * - `overlay`: the region stops taking a column and is drawn as an on-demand,
 *   dismissible drawer over the main pane, so it never squeezes the composer.
 *
 * Overlaying is a presentation change, not a visibility change: the region's
 * `visibility` state — and therefore the rail toggle's pressed state and the
 * user's explicit intent — is untouched.
 */
export const REGION_PRESENTATIONS = ['inline', 'overlay'] as const;

/** The presentation of one region at a given window width. */
export type RegionPresentation = (typeof REGION_PRESENTATIONS)[number];

/** The presentation of both toggleable regions at a given window width. */
export interface RegionLayout {
  readonly sidebar: RegionPresentation;
  readonly rightPanel: RegionPresentation;
}

/**
 * The measured geometry the breakpoints are derived from. The pixel values
 * mirror the geometry tokens in `src/shared/ui/tokens.css`; keeping them here
 * lets the derivation below be asserted instead of asserted-in-a-comment.
 *
 * Both floors are measured, not invented (`#43` Explorer measurement, re-checked
 * against the live DOM):
 *
 * - `mainPaneFloor` 366px — the conversation main pane's content floor; below
 *   it the message column is clipped by the pane's `overflow: hidden` (the #40
 *   width sweep flipped clean at 1200 with both regions inline).
 * - `composerDockFloor` 705px — the composer's max-content width (action row
 *   632 + box padding 23 = 655, plus the dock's 24px gutters); the wireframe
 *   width at which the action row — and the send control — stays on one line.
 */
export const LAYOUT_METRICS = {
  railWidth: 56,
  sidebarWidth: 318,
  rightPanelWidth: 460,
  mainPaneFloor: 366,
  composerDockFloor: 705
} as const;

/**
 * The window-width breakpoints, derived by adding the measured floors to the
 * chrome they have to share space with. No magic round numbers.
 */
export const LAYOUT_BREAKPOINTS = {
  /**
   * At or above this width both regions keep their columns: the main pane still
   * clears its 366px content floor beside the rail, the sidebar and the panel
   * (56 + 318 + 460 + 366 = 1200). Below it the panel overlays first.
   */
  rightPanelInlineMin:
    LAYOUT_METRICS.railWidth +
    LAYOUT_METRICS.sidebarWidth +
    LAYOUT_METRICS.rightPanelWidth +
    LAYOUT_METRICS.mainPaneFloor,
  /**
   * At or above this width the sidebar keeps its column while the panel is
   * already overlaid: the main pane still fits the composer's 705px single-row
   * width beside the rail and the sidebar (56 + 318 + 705 = 1079). Below it the
   * sidebar collapses to the rail and becomes an on-demand drawer.
   */
  sidebarInlineMin:
    LAYOUT_METRICS.railWidth +
    LAYOUT_METRICS.sidebarWidth +
    LAYOUT_METRICS.composerDockFloor
} as const;

/**
 * Resolves how the two open regions are presented at a window width. Pure, so
 * the shell only wires it to the measured width and the rules stay observable
 * in the node test runner.
 */
export function resolveRegionLayout(windowWidth: number): RegionLayout {
  return {
    sidebar:
      windowWidth >= LAYOUT_BREAKPOINTS.sidebarInlineMin ? 'inline' : 'overlay',
    rightPanel:
      windowWidth >= LAYOUT_BREAKPOINTS.rightPanelInlineMin
        ? 'inline'
        : 'overlay'
  };
}
