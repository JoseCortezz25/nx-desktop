import './checkbox.css';

export interface CheckboxProps {
  readonly label: string;
  readonly isChecked: boolean;
  readonly onChange?: () => void;
  readonly isDisabled?: boolean;
}

/** Native, controlled selection primitive; no internal state. */
export function Checkbox({
  label,
  isChecked,
  onChange,
  isDisabled = false
}: CheckboxProps) {
  return (
    <input
      className="checkbox"
      type="checkbox"
      aria-label={label}
      checked={isChecked}
      disabled={isDisabled}
      onChange={onChange}
      readOnly={!onChange}
    />
  );
}
