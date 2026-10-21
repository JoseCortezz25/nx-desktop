/**
 * IPC-backed `Abrir` targets (issue #24).
 *
 * Implements `OpenTargetRepository` over `list_open_targets` and
 * `open_in_target` (#21). The machine report is parameterless; the launch is
 * project-scoped, so it carries the `projectId` whose roots the Rust core
 * validates the path against before it starts anything. The core, not this
 * adapter, enforces the allowed target.
 */
import type { OpenTargetAvailability } from '@/shared/domain/open-target.types';
import { listOpenTargets, openInTarget } from './open-target-client';
import type { OpenTargetAvailabilityDto } from './open-target.contracts';
import type { OpenTargetRepository } from './open-target-repository';

function toAvailability(
  dto: OpenTargetAvailabilityDto
): OpenTargetAvailability {
  return { target: dto.target, isInstalled: dto.isInstalled };
}

/** Builds the open-target port over the typed IPC client. */
export function createIpcOpenTargetRepository(): OpenTargetRepository {
  return {
    listOpenTargets() {
      return listOpenTargets().then(rows => rows.map(toAvailability));
    },

    openInTarget(projectId, target, path) {
      return openInTarget(projectId, target, path);
    }
  };
}
