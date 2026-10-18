/**
 * Typed IPC clients for the `Abrir` open targets (issue #16, slice 4).
 *
 * The menu asks which targets exist and then reports the intent to open one
 * file. It never spawns an editor itself: the launch belongs to the Rust core,
 * which validates the project roots, the workspace-relative path and the
 * allowed target (#12/#24). The current port is a stub; this client is the
 * seam its replacement will use.
 */
import type { OpenTarget } from '@/shared/domain/open-target.types';
import type {
  ProjectId,
  WorkspacePath
} from '@/shared/domain/value-objects.types';
import { ipcInvoke } from '@/shared/ipc/client';
import type {
  OpenInTargetRequestDto,
  OpenTargetAvailabilityDto
} from './open-target.contracts';

/** Reports every target the machine knows, installed or not. */
export function listOpenTargets(): Promise<OpenTargetAvailabilityDto[]> {
  return ipcInvoke<OpenTargetAvailabilityDto[]>('list_open_targets');
}

/**
 * Asks the Rust core to open `path` in `target`.
 *
 * `projectId` is authority-bearing and `path` stays workspace-relative; the core
 * rejects out-of-workspace paths and targets the current product policy does not
 * offer. Resolves `undefined` after the intent is accepted.
 */
export function openInTarget(
  projectId: ProjectId,
  target: OpenTarget,
  path: WorkspacePath
): Promise<void> {
  const request: OpenInTargetRequestDto = { projectId, target, path };
  return ipcInvoke<null>('open_in_target', { request }).then(() => undefined);
}
