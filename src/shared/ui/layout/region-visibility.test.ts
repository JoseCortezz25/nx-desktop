import { describe, expect, it } from 'vitest';
import {
  INITIAL_REGION_VISIBILITY,
  isRegionOpen,
  LAYOUT_BREAKPOINTS,
  LAYOUT_METRICS,
  resolveRegionLayout,
  toggleRegion,
  type RegionVisibility
} from './region-visibility';

describe('region visibility', () => {
  it('starts with both toggleable regions closed (wireframe screen 01)', () => {
    expect(INITIAL_REGION_VISIBILITY).toEqual({
      sidebar: false,
      rightPanel: false
    });
  });

  it('opens the sidebar without affecting the right panel', () => {
    const next = toggleRegion(INITIAL_REGION_VISIBILITY, 'sidebar');
    expect(next).toEqual({ sidebar: true, rightPanel: false });
  });

  it('opens the right panel without affecting the sidebar', () => {
    const next = toggleRegion(INITIAL_REGION_VISIBILITY, 'rightPanel');
    expect(next).toEqual({ sidebar: false, rightPanel: true });
  });

  it('closes a region that is already open', () => {
    const opened = toggleRegion(INITIAL_REGION_VISIBILITY, 'sidebar');
    expect(toggleRegion(opened, 'sidebar')).toEqual({
      sidebar: false,
      rightPanel: false
    });
  });

  it('toggles both regions independently', () => {
    const both = toggleRegion(
      toggleRegion(INITIAL_REGION_VISIBILITY, 'sidebar'),
      'rightPanel'
    );
    expect(both).toEqual({ sidebar: true, rightPanel: true });
  });

  it('never mutates the state it receives', () => {
    const before: RegionVisibility = { sidebar: false, rightPanel: true };
    const snapshot = { ...before };

    toggleRegion(before, 'sidebar');
    toggleRegion(before, 'rightPanel');

    expect(before).toEqual(snapshot);
    expect(before).not.toBe(snapshot);
  });

  it('reports whether a region is open', () => {
    expect(isRegionOpen(INITIAL_REGION_VISIBILITY, 'sidebar')).toBe(false);
    expect(
      isRegionOpen(
        toggleRegion(INITIAL_REGION_VISIBILITY, 'sidebar'),
        'sidebar'
      )
    ).toBe(true);
  });
});

describe('region layout breakpoints (#43)', () => {
  /**
   * The breakpoints are the measured floors added up, not round numbers chosen
   * for looks: the panel keeps its column only while the main pane still clears
   * the conversation's measured content floor, and the sidebar keeps its column
   * only while the composer still renders at its measured single-row width.
   */
  it('derives the panel breakpoint from the main pane floor', () => {
    expect(LAYOUT_BREAKPOINTS.rightPanelInlineMin).toBe(
      LAYOUT_METRICS.railWidth +
        LAYOUT_METRICS.sidebarWidth +
        LAYOUT_METRICS.rightPanelWidth +
        LAYOUT_METRICS.mainPaneFloor
    );
    expect(LAYOUT_BREAKPOINTS.rightPanelInlineMin).toBe(1200);
  });

  it('derives the sidebar breakpoint from the composer dock floor', () => {
    expect(LAYOUT_BREAKPOINTS.sidebarInlineMin).toBe(
      LAYOUT_METRICS.railWidth +
        LAYOUT_METRICS.sidebarWidth +
        LAYOUT_METRICS.composerDockFloor
    );
    expect(LAYOUT_BREAKPOINTS.sidebarInlineMin).toBe(1079);
  });

  it('overlays the panel before it collapses the sidebar', () => {
    // Order matters: as the window narrows the secondary, contextual panel
    // gives way first; the primary navigation sidebar gives way later.
    expect(LAYOUT_BREAKPOINTS.sidebarInlineMin).toBeLessThan(
      LAYOUT_BREAKPOINTS.rightPanelInlineMin
    );
  });

  it('keeps both regions inline at and above the panel breakpoint', () => {
    expect(resolveRegionLayout(LAYOUT_BREAKPOINTS.rightPanelInlineMin)).toEqual(
      {
        sidebar: 'inline',
        rightPanel: 'inline'
      }
    );
    expect(resolveRegionLayout(1440)).toEqual({
      sidebar: 'inline',
      rightPanel: 'inline'
    });
  });

  it('overlays only the panel between the two breakpoints', () => {
    expect(
      resolveRegionLayout(LAYOUT_BREAKPOINTS.rightPanelInlineMin - 1)
    ).toEqual({ sidebar: 'inline', rightPanel: 'overlay' });
    expect(resolveRegionLayout(LAYOUT_BREAKPOINTS.sidebarInlineMin)).toEqual({
      sidebar: 'inline',
      rightPanel: 'overlay'
    });
  });

  it('overlays both regions below the sidebar breakpoint', () => {
    expect(
      resolveRegionLayout(LAYOUT_BREAKPOINTS.sidebarInlineMin - 1)
    ).toEqual({ sidebar: 'overlay', rightPanel: 'overlay' });
    expect(resolveRegionLayout(900)).toEqual({
      sidebar: 'overlay',
      rightPanel: 'overlay'
    });
  });

  it('never returns a region to a column as the window narrows', () => {
    // Monotonic degradation: once a region has given way it cannot come back
    // while the window keeps shrinking, or the toggle would flap.
    const widths = [1600, 1440, 1200, 1199, 1080, 1079, 1000, 900];
    const sidebarRanks = widths.map(width =>
      resolveRegionLayout(width).sidebar === 'inline' ? 1 : 0
    );
    const panelRanks = widths.map(width =>
      resolveRegionLayout(width).rightPanel === 'inline' ? 1 : 0
    );

    for (let index = 1; index < widths.length; index += 1) {
      expect(sidebarRanks[index]).toBeLessThanOrEqual(
        sidebarRanks[index - 1] ?? 0
      );
      expect(panelRanks[index]).toBeLessThanOrEqual(panelRanks[index - 1] ?? 0);
    }
  });
});
