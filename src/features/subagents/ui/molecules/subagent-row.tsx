import { SubagentAvatar } from '../atoms/subagent-avatar';
import { Button } from '@/shared/ui/atoms/button';
import './subagent-row.css';

export interface SubagentRowProps {
  /** The subagent's display name; also the accessible-name base. */
  readonly name: string;
  /* Presentation avatar variant the record carries; keyed data. */
  readonly avatarVariant: string;
  /** Resolved status copy the caller owns (`getSubagentStatusLabel`). */
  readonly statusLabel: string;
  /** Resolved elapsed read-out, from `formatElapsed`. */
  readonly elapsedLabel: string;
  /** Pressing the row opens the subagent's detail (S2). */
  readonly onPress: () => void;
}

/**
 * Molecule: one subagent in the grouped list (`docs/wireframes/
 * 21-subagents-list.html`, `.agent-row`): avatar, name and status, with the
 * elapsed time at the trailing edge. It composes the `SubagentAvatar` atom and
 * reports the press up; grouping, copy and records stay with the owner.
 */
export function SubagentRow({
  name,
  avatarVariant,
  statusLabel,
  elapsedLabel,
  onPress
}: SubagentRowProps) {
  return (
    <Button variant="plain" onPress={onPress}>
      <span className="subagent-row">
        <SubagentAvatar variant={avatarVariant} label={name} />
        <span className="subagent-row__meta">
          <span className="subagent-row__name">{name}</span>
          <span className="subagent-row__status">{statusLabel}</span>
        </span>
        <span className="subagent-row__elapsed">{elapsedLabel}</span>
      </span>
    </Button>
  );
}
