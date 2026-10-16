import { describe, expect, it } from 'vitest';
import type { OpenTargetAvailability } from '@/shared/domain/open-target.types';
import { buildOpenMenuItems } from './open-menu';

/** A machine report that carries every target the wireframe draws, installed. */
const FULL_REPORT: readonly OpenTargetAvailability[] = [
  { target: 'editor', isInstalled: true },
  { target: 'view_source', isInstalled: true },
  { target: 'search_in_file', isInstalled: true },
  { target: 'reveal_in_file_manager', isInstalled: true },
  { target: 'copy_path', isInstalled: true }
];

describe('open menu entries', () => {
  it('offers the editor target when the machine reports it installed', () => {
    const items = buildOpenMenuItems(FULL_REPORT);

    expect(items.map(item => item.target)).toEqual(['editor']);
  });

  it('offers nothing when VS Code is not installed', () => {
    const items = buildOpenMenuItems(
      FULL_REPORT.map(availability =>
        availability.target === 'editor'
          ? { ...availability, isInstalled: false }
          : availability
      )
    );

    expect(items).toEqual([]);
  });

  it('never offers the file-manager entry, even when the report carries it', () => {
    const items = buildOpenMenuItems(FULL_REPORT);

    expect(items).not.toContainEqual({ target: 'reveal_in_file_manager' });
    expect(items.map(item => item.target)).not.toContain('view_source');
    expect(items.map(item => item.target)).not.toContain('copy_path');
  });

  it('offers nothing while the machine report is empty', () => {
    expect(buildOpenMenuItems([])).toEqual([]);
  });
});
