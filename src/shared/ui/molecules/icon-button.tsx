import { Button } from '../atoms/button';
import { Icon } from '../atoms/icon';
import type { IconName, IconSize } from '../atoms/icon';

export interface IconButtonProps {
  readonly icon: IconName;
  /** Accessible name; icon-only controls carry no visible text. */
  readonly label: string;
  readonly size?: IconSize;
  readonly isActive?: boolean;
  readonly isPressed?: boolean;
  /** Sets `aria-current="page"` for navigation buttons. */
  readonly isCurrent?: boolean;
  /** Sets `aria-expanded` for icon controls that disclose a popover. */
  readonly isExpanded?: boolean;
  readonly isDisabled?: boolean;
  readonly onPress?: () => void;
}

/** Molecule: a `Button` atom wired around an `Icon` atom. */
export function IconButton({
  icon,
  label,
  size = 'md',
  isActive,
  isPressed,
  isCurrent,
  isExpanded,
  isDisabled,
  onPress
}: IconButtonProps) {
  return (
    <Button
      variant="icon"
      label={label}
      isActive={isActive}
      isPressed={isPressed}
      isCurrent={isCurrent}
      isExpanded={isExpanded}
      isDisabled={isDisabled}
      onPress={onPress}
    >
      <Icon name={icon} size={size} />
    </Button>
  );
}
