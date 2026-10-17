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
