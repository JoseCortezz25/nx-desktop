import { Icon } from '../atoms/icon';
import type { IconName } from '../atoms/icon';
import './tool-activity-row.css';

export interface ToolActivityRowProps {
  /** Glyph for the tool kind (`search`, `command`, `list_files`). */
  readonly icon: IconName;
  /** Short description of the executed tool, from `ToolCall.summary`. */
  readonly summary: string;
}

/**
 * Molecule: one executed tool drawn inside a collapsible group
 * (`docs/wireframes/README.md`, "Reusable components" — `ToolActivityRow`). It
 * is presentational — icon plus summary — and holds no state; the group's
 * expanded/collapsed state belongs to the conversation view, its single owner.
 */
export function ToolActivityRow({ icon, summary }: ToolActivityRowProps) {
  return (
    <div className="tool-activity-row">
      <Icon name={icon} size="sm" />
      <span className="tool-activity-row__summary">{summary}</span>
    </div>
  );
}
