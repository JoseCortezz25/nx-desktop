import { Button } from '../atoms/button';
import type { ButtonTone } from '../atoms/button';
import { Icon } from '../atoms/icon';
import type { IconName } from '../atoms/icon';
import './select-trigger.css';

export interface SelectTriggerProps {
  /**
   * Accessible name for the chip. The visible value is a provider, model or
   * effort name resolved from the catalog, so the name is built by the caller.
   */
  readonly label: string;
  /** Current value drawn in the chip. */
  readonly value: string;
  /** Optional leading glyph (the provider chip draws one). */
  readonly icon?: IconName;
  /** Optional colour treatment (the unrestricted approval chip warns). */
  readonly tone?: ButtonTone;
  /** Whether the chip's popover is open. */
  readonly isExpanded?: boolean;
  readonly onPress?: () => void;
}

/**
 * Molecule: the composer's selector chip — a `Button` atom carrying the current
 * value and a disclosure chevron. It holds no state; the composer organism owns
 * which chip is expanded (`docs/wireframes/16-provider-selector.html`,
 * `.provider-chip`).
 */
export function SelectTrigger({
  label,
  value,
  icon,
  tone,
  isExpanded,
  onPress
}: SelectTriggerProps) {
  return (
    <Button
      variant="pill"
      label={label}
      tone={tone}
      isExpanded={isExpanded}
      onPress={onPress}
    >
      {icon ? <Icon name={icon} size="sm" /> : null}
      <span className="select-trigger__value">{value}</span>
      <Icon name="chevron-down" size="sm" />
    </Button>
  );
}
