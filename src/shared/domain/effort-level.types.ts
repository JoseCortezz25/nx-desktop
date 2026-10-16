/**
 * Effort levels of the composer selection chain.
 *
 * The wireframes render a five-stop effort slider whose first stop is "light"
 * (`docs/wireframes/08-effort-selector.html`). Which stops a given model accepts
 * is an explicit open product question (`.claude/knowledge/business-logic.md`
 * §4, item 1), so this module declares only the canonical ladder and each
 * `Model` advertises the subset it supports through `supportedEffortLevels`.
 *
 * Display labels are intentionally absent: the wireframe wording is a
 * placeholder and real UI copy goes through i18n when the popover ships.
 */
export const EFFORT_LEVELS = [
  'light',
  'standard',
  'high',
  'extended',
  'maximum'
] as const;

/** A single stop on the effort scale. */
export type EffortLevel = (typeof EFFORT_LEVELS)[number];
