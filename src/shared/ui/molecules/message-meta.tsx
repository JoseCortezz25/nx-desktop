import { Button } from '../atoms/button';
import { IconButton } from './icon-button';
import './message-meta.css';

export interface MessageMetaProps {
  /** Visible time text, formatted by the conversation model. */
  readonly time: string;
  /** Accessible name for the timestamp button, built from the time. */
  readonly timestampLabel: string;
  readonly editLabel: string;
  readonly onEdit: () => void;
}

/**
 * Molecule: the timestamp and edit affordances the locked specification places
 * below the message bubbles (`.claude/knowledge/business-logic.md` §3.5 item 2;
 * ticket #11). The wireframe does not draw them yet, so they are inferred in the
 * wireframe's own idiom: a muted text button carrying the time and a muted icon
 * button carrying the edit glyph. Both are buttons, and both take their copy
 * from `messages.ts`.
 */
export function MessageMeta({
  time,
  timestampLabel,
  editLabel,
  onEdit
}: MessageMetaProps) {
  return (
    <div className="message-meta">
      <Button variant="text" label={timestampLabel}>
        <span className="message-meta__time">{time}</span>
      </Button>
      <IconButton
        icon="square-pen"
        label={editLabel}
        size="sm"
        onPress={onEdit}
      />
    </div>
  );
}
