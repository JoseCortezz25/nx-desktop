import type { ChangeEvent } from 'react';
import './text-input.css';

export interface TextInputProps {
  /** Accessible name; the parent row draws the visible label. */
  readonly label: string;
  readonly value: string;
  readonly placeholder?: string;
  readonly onChange?: (value: string) => void;
}

/**
 * Indivisible single-line text field. It reports the raw value up through
 * `onChange`; the parent owns the value, which keeps the field stateless and
 * reusable by any settings-shaped surface.
 */
export function TextInput({
  label,
  value,
  placeholder,
  onChange
}: TextInputProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange?.(event.target.value);
  }

  return (
    <input
      type="text"
      className="text-input"
      aria-label={label}
      value={value}
      placeholder={placeholder}
      onChange={handleChange}
    />
  );
}
