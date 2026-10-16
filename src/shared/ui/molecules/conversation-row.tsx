import { Button } from '../atoms/button';
import './conversation-row.css';

export interface ConversationRowProps {
  /** Conversation title; also the row's accessible name. */
  readonly title: string;
  /** The conversation the shell has open, highlighted in place. */
  readonly isActive: boolean;
  readonly onSelect: () => void;
}

/**
 * Molecule: one conversation row in the sidebar (`docs/wireframes/README.md`,
 * screens 02 and 11). It draws a title and reports selection upward; the pin
 * state is expressed by the group the row is placed in, and the active state by
 * `isActive`, so the molecule owns neither flag.
 */
export function ConversationRow({
  title,
  isActive,
  onSelect
}: ConversationRowProps) {
  return (
    <Button
      variant="list"
      isActive={isActive}
      isCurrent={isActive}
      onPress={onSelect}
    >
      <span className="conversation-row__title">{title}</span>
    </Button>
  );
}
