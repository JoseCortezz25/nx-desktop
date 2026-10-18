import { getSharedMessages } from '@/shared/i18n/messages';
import { Button } from '../atoms/button';
import { Icon } from '../atoms/icon';
import type { IconName } from '../atoms/icon';
import './tool-activity-row.css';

export interface ToolActivityRowProps {
  /** Glyph for the tool kind (`search`, `command`, `list_files`). */
  readonly icon: IconName;
  /** Short description of the executed tool, from `ToolCall.summary`. */
  readonly summary: string;
  readonly onPress?: () => void;
  readonly ariaLabel?: string;
}

/**
 * Molecule: one executed tool drawn inside a collapsible group
 * (`docs/wireframes/README.md`, "Reusable components" — `ToolActivityRow`). It
 * is presentational — icon plus summary — and holds no state; the group's
 * expanded/collapsed state belongs to the conversation view, its single owner.
 *
 * `onPress` is the one thing that turns the row into a control: screen 18 draws
 * the `git diff` activity as the way into the change set, so a row that opens the
 * panel renders as a button, while every other tool keeps the inert treatment
 * screens 11 and 12 draw.
 */
export function ToolActivityRow({
  icon,
  summary,
  onPress,
  ariaLabel = getSharedMessages().conversation.toolActivity.openChangesLabel
}: ToolActivityRowProps) {
  if (onPress) {
    return (
      <div className="tool-activity-row">
        <Button variant="plain" label={ariaLabel} onPress={onPress}>
          <Icon name={icon} size="sm" />
          <span className="tool-activity-row__summary">{summary}</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="tool-activity-row">
      <Icon name={icon} size="sm" />
      <span className="tool-activity-row__summary">{summary}</span>
    </div>
  );
}
