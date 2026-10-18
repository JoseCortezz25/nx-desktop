import './subagent-avatar.css';

export interface SubagentAvatarProps {
  /**
   * Presentation variant the record names (`'globe'`, `'flower'`, ...). The
   * value is sampled data: a variant the presentation layer does not know yet
   * draws the generic mark instead of failing, and never reaches a class name
   * unfiltered.
   */
  readonly variant: string;
  /** Accessible name of the decorative figure (usually the subagent's name). */
  readonly label: string;
}

/** Avatar variants with a drawn shape; anything else falls to `default`. */
const KNOWN_VARIANTS = new Set(['globe', 'flower']);

/**
 * Digits one avatar variant into the class name the stylesheet can key on. The
 * variant never becomes part of a class name unfiltered, so sampled data stays
 * decorative data.
 */
function variantClass(variant: string): string {
  return KNOWN_VARIANTS.has(variant)
    ? `subagent-avatar--${variant}`
    : 'subagent-avatar--default';
}

/**
 * Atom: the decorative avatar of one subagent (`docs/wireframes/
 * 21-subagents-list.html`, `.agent-row .av`). Pure drawing over the variant
 * key: props only, no state, no IPC, no store. The hero marks are the
 * wireframe's two glyphs (a globe and a five-petal flower), palette from the
 * tokens every avatar reads, and the fallback is the plain ring.
 */
export function SubagentAvatar({ variant, label }: SubagentAvatarProps) {
  return (
    <span className={variantClass(variant)} role="img" aria-label={label}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {variant === 'flower' ? (
          <g className="subagent-avatar__petals">
            <circle cx="12" cy="6.5" r="4.5" />
            <circle cx="17.5" cy="10.5" r="4.5" />
            <circle cx="15.5" cy="17" r="4.5" />
            <circle cx="8.5" cy="17" r="4.5" />
            <circle cx="6.5" cy="10.5" r="4.5" />
            <circle className="subagent-avatar__core" cx="12" cy="12" r="3" />
          </g>
        ) : variant === 'globe' ? (
          <g>
            <circle
              className="subagent-avatar__globe"
              cx="12"
              cy="12"
              r="7.5"
            />
            <ellipse
              className="subagent-avatar__globe"
              cx="12"
              cy="12"
              rx="3.2"
              ry="7.5"
            />
            <path className="subagent-avatar__globe" d="M4.5 9h15M4.5 15h15" />
          </g>
        ) : (
          <circle className="subagent-avatar__ring" cx="12" cy="12" r="7.5" />
        )}
      </svg>
    </span>
  );
}
