import type { IconName } from '../atoms/icon';
import { Button } from '../atoms/button';
import { Icon } from '../atoms/icon';
import { ToolActivityRow } from './tool-activity-row';
import './tool-activity-group.css';

/** One row the group renders: its id keys the row, the rest is drawn. */
export interface ToolActivityRowItem {
  readonly id: string;
  readonly icon: IconName;
  readonly summary: string;
  /** Whether pressing the row opens the workspace change set (#13). */
  readonly opensChanges: boolean;
}

export interface ToolActivityGroupProps {
  /** Visible header text, e.g. the action count built from the runtime data. */
  readonly summary: string;
  /** Accessible name while the rows are hidden. */
  readonly expandLabel: string;
  /** Accessible name while the rows are shown. */
  readonly collapseLabel: string;
  readonly isExpanded: boolean;
  readonly rows: readonly ToolActivityRowItem[];
  /** Reports the press up; the group's owner flips the expanded/collapsed state. */
  readonly onToggle: () => void;
  /** Opens the change set in the right panel; only the `diff` rows use it (#13). */
  readonly onOpenChanges?: () => void;
}

/**
 * Molecule: a collapsible group of executed tools
 * (`docs/wireframes/README.md`, "Reusable components"; screens 11 and 12). It
 * composes the header disclosure with the rows, and holds no state of its own:
 * `isExpanded` and `onToggle` are controlled by the conversation view, so the
 * expanded/collapsed state has exactly one owner and is never duplicated per
 * row.
 */
export function ToolActivityGroup({
  summary,
  expandLabel,
  collapseLabel,
  isExpanded,
  rows,
  onToggle,
  onOpenChanges
}: ToolActivityGroupProps) {
  return (
    <div className="tool-activity-group">
      <Button
        variant="plain"
        label={isExpanded ? collapseLabel : expandLabel}
        isExpanded={isExpanded}
        onPress={onToggle}
      >
        <span className="tool-activity-group__summary">{summary}</span>
        <Icon name="chevron-down" size="sm" />
      </Button>

      {isExpanded ? (
        <div className="tool-activity-group__rows">
          {rows.map(row => (
            <ToolActivityRow
              key={row.id}
              icon={row.icon}
              summary={row.summary}
              onPress={row.opensChanges ? onOpenChanges : undefined}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
