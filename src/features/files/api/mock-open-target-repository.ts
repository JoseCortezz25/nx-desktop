/**
 * Mock machine report behind the `Abrir` menu, kept as a test fixture. The
 * running app reads the IPC-backed repository (#24).
 *
 * The report carries the file-manager target the wireframe draws, marked as
 * installed, on purpose: the menu must not offer it while the locked decision
 * holds (`.claude/knowledge/business-logic.md` §3.5 item 3), so the restriction
 * is enforced against real report data rather than against the mock omitting it.
 */
import type { OpenTargetAvailability } from '@/shared/domain/open-target.types';
import type { OpenTargetRepository } from './open-target-repository';

const REPORTED_TARGETS: readonly OpenTargetAvailability[] = [
  { target: 'editor', isInstalled: true },
  { target: 'reveal_in_file_manager', isInstalled: true }
];

export interface MockOpenTargetOptions {
  /** Reports VS Code as missing — the case the menu must hide the entry for. */
  readonly isEditorInstalled?: boolean;
}

/**
 * Builds an `OpenTargetRepository` over the mock report. A factory keeps the seam
 * identical to the future IPC client, and the option lets a caller (or a test)
 * exercise the not-installed case.
 */
export function createMockOpenTargetRepository(
  options: MockOpenTargetOptions = {}
): OpenTargetRepository {
  const isEditorInstalled = options.isEditorInstalled ?? true;

  return {
    listOpenTargets() {
      return Promise.resolve(
        REPORTED_TARGETS.map(availability =>
          availability.target === 'editor'
            ? { ...availability, isInstalled: isEditorInstalled }
            : availability
        )
      );
    },
    openInTarget() {
      // Fixture: nothing is spawned here; the real launch is the core's.
      return Promise.resolve();
    }
  };
}
