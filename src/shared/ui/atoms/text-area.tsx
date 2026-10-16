import type { ChangeEvent } from 'react';
import './text-area.css';

export interface TextAreaProps {
  /** Accessible name for the field; the composer draws no visible label. */
  readonly label: string;
  readonly value: string;
  /** Prompt copy shown while the field is empty (the composer's placeholder). */
  readonly placeholder?: string;
  readonly rows?: number;
  readonly onChange?: (value: string) => void;
}

/**
 * Indivisible multiline text primitive. It only reports the raw field value up
 * through `onChange`; the composer organism owns the draft and the submit rule
 * (`docs/wireframes/README.md`, "Reusable components": the composer's input).
 */
export function TextArea({
  label,
  value,
  placeholder,
  rows = 1,
  onChange
}: TextAreaProps) {
  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    onChange?.(event.target.value);
  }

  return (
    <textarea
      className="text-area"
      aria-label={label}
      value={value}
      placeholder={placeholder}
      rows={rows}
      onChange={handleChange}
    />
  );
}
