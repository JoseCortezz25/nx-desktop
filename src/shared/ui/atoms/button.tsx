import type { ReactNode } from 'react';
import './button.css';

export type ButtonVariant = 'text' | 'icon' | 'plain' | 'list' | 'solid';

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
      aria-label={label}
      aria-pressed={isPressed}
      aria-current={isCurrent ? 'page' : undefined}
      disabled={isDisabled}
      onClick={onPress}
    >
      {children}
    </button>
  );
}
