import type { ReactNode } from 'react';
import './button.css';

export type ButtonVariant =
  'text' | 'icon' | 'plain' | 'list' | 'pill' | 'solid';

export interface ButtonProps {
  /** Visual variant. Placement and spacing belong to the parent. */
  readonly variant?: ButtonVariant;
  /** Accessible name for icon-only buttons. */
  readonly label?: string;
  /** Visual highlight for the current or toggled state. */
  readonly isActive?: boolean;
  /** Sets `aria-pressed` for toggle buttons. */
  readonly isPressed?: boolean;
  /** Sets `aria-current="page"` for navigation buttons. */
  readonly isCurrent?: boolean;
  /** Sets `aria-expanded` for controls that disclose a popover. */
  readonly isExpanded?: boolean;
  /**
   * ARIA role override for controls that are not plain buttons. List rows in a
   * `listbox` use `'option'`; pair it with `isSelected`.
   */
  readonly role?: 'option';
  /** Sets `aria-selected` for `role="option"` rows. */
  readonly isSelected?: boolean;
  readonly isDisabled?: boolean;
  readonly onPress?: () => void;
  readonly children: ReactNode;
}

/** Indivisible interactive primitive: a native button with visual variants. */
export function Button({
  variant = 'text',
  label,
  isActive = false,
  isPressed,
  isCurrent = false,
  isExpanded,
  role,
  isSelected,
  isDisabled = false,
  onPress,
  children
}: ButtonProps) {
  const className = `button button--${variant}${
    isActive ? ' button--active' : ''
  }`;

  return (
    <button
      type="button"
      className={className}
      role={role}
      aria-label={label}
      aria-pressed={isPressed}
      aria-current={isCurrent ? 'page' : undefined}
      aria-expanded={isExpanded}
      aria-selected={role === 'option' ? isSelected : undefined}
      disabled={isDisabled}
      onClick={onPress}
    >
      {children}
    </button>
  );
}
