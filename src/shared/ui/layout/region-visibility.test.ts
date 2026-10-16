import { describe, expect, it } from 'vitest';
import {
  INITIAL_REGION_VISIBILITY,
  isRegionOpen,
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
