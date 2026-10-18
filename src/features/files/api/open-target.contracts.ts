/**
 * Wire contracts for the `Abrir` open targets (issue #16, slice 4).
 *
 * `list_open_targets` reports which targets the machine knows, installed or not
 * (`open-target.types.ts`); it is parameterless because the report is
 * machine-scoped. `open_in_target` is project-scoped: `projectId` resolves the
 * authorized roots and `path` must stay inside them
 * (`.claude/knowledge/business-logic.md` §3.3). The locked `Abrir` decision
 * offers only VS Code when installed (`.claude/knowledge/business-logic.md`
 * §3.5 item 3); Rust enforces the destination and the allowed target, never the
 * menu that drew it (#12/#24).
 */
import type { OpenTarget } from '@/shared/domain/open-target.types';
import type {
  ProjectId,
  WorkspacePath
} from '@/shared/domain/value-objects.types';

/** One external target's availability on the machine. */
export interface OpenTargetAvailabilityDto {
  target: OpenTarget;
  isInstalled: boolean;
}

/**
 * Request envelope for `open_in_target`.
 *
 * The response is `null`: the port records the intent and launches from the
 * Rust core, so there is no payload for the UI to render.
 */
export interface OpenInTargetRequestDto {
  projectId: ProjectId;
  target: OpenTarget;
  path: WorkspacePath;
}
