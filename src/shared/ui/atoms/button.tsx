import type { ReactNode } from 'react';
import './button.css';

export type ButtonVariant =
  'text' | 'icon' | 'plain' | 'list' | 'pill' | 'solid';

/**
 * `warn` is the caution treatment the wireframe gives the unrestricted approval
 * level and the chip that carries it (`docs/wireframes/10-approval-mode.html`);
 * `neutral` is every other control.
 */
export type ButtonTone = 'neutral' | 'warn';

export interface ButtonProps {
  /** Visual variant. Placement and spacing belong to the parent. */
  readonly variant?: ButtonVariant;
  /** Colour treatment. Placement and spacing belong to the parent. */
  readonly tone?: ButtonTone;
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
   * `listbox` use `'option'`, the right panel's file tabs use `'tab'` and the
   * `Abrir` menu rows use `'menuitem'`; pair `'option'` and `'tab'` with
   * `isSelected`.
   */
  readonly role?: 'option' | 'tab' | 'menuitem';
  /** Sets `aria-selected` for `role="option"` rows. */
  readonly isSelected?: boolean;
  readonly isDisabled?: boolean;
  readonly onPress?: () => void;
  readonly children: ReactNode;
}

/** Indivisible interactive primitive: a native button with visual variants. */
export function Button({
  variant = 'text',
  tone = 'neutral',
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
    tone === 'warn' ? ' button--warn' : ''
  }${isActive ? ' button--active' : ''}`;

  return (
    <button
      type="button"
      className={className}
      role={role}
      aria-label={label}
      aria-pressed={isPressed}
      aria-current={isCurrent ? 'page' : undefined}
      aria-expanded={isExpanded}
      aria-selected={
        role === 'option' || role === 'tab' ? isSelected : undefined
      }
      disabled={isDisabled}
      onClick={onPress}
    >
      {children}
    </button>
  );
}
