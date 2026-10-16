/**
 * The entries of the `Abrir` menu.
 *
 * `.claude/knowledge/business-logic.md` §3.5 item 3 (decision 2026-10-16): the
 * menu offers the editor target only, it MUST NOT appear when VS Code is not
 * installed, and no other editor or shell target replaces it. The rule is
 * enforced here against the target list the port reports, so a machine report
 * that carries the file-manager entry (the wireframe draws one) still produces a
 * menu without it.
 */
import {
  OPEN_MENU_TARGETS,
  type OpenTarget,
  type OpenTargetAvailability
} from '@/shared/domain/open-target.types';

/** One row the `Abrir` menu draws. */
export interface OpenMenuItem {
  readonly target: OpenTarget;
}

/**
 * Filters the machine's report down to the offered entries: the corrected
 * target list, and only the targets that are actually installed. An empty result
 * means the control must not be drawn at all.
 */
export function buildOpenMenuItems(
  targets: readonly OpenTargetAvailability[]
): readonly OpenMenuItem[] {
  return OPEN_MENU_TARGETS.flatMap(target =>
    targets.some(
      availability =>
        availability.target === target && availability.isInstalled === true
    )
      ? [{ target }]
      : []
  );
}
