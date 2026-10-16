import './switch.css';

export interface SwitchProps {
  /** Accessible name; the visible label is drawn by the parent row. */
  readonly label: string;
  readonly isOn: boolean;
  readonly onToggle?: () => void;
}

/**
 * Indivisible binary control. It reports the toggle intent up through
 * `onToggle` and owns no state: the environment popover keeps the
 * `RunEnvironment` and hands the flag back down.
 */
export function Switch({ label, isOn, onToggle }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      aria-label={label}
      className={`switch${isOn ? ' switch--on' : ''}`}
      onClick={onToggle}
    >
      <span className="switch__thumb" />
    </button>
  );
}
