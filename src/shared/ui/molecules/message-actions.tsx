import { IconButton } from './icon-button';
import './message-actions.css';

export interface MessageActionsProps {
  readonly copyLabel: string;
  readonly shareLabel: string;
  readonly onCopy: () => void;
  readonly onShare: () => void;
}

/**
 * Molecule: the actions row under an assistant message
 * (`docs/wireframes/README.md`, "Reusable components" — `MessageActions`; the
 * row drawn in `12-chat-conversation-full.html`, `.msg-actions`). It composes
 * the icon buttons for one UI job and holds no state: props down, events up.
 */
export function MessageActions({
  copyLabel,
  shareLabel,
  onCopy,
  onShare
}: MessageActionsProps) {
  return (
    <div className="message-actions">
      <IconButton icon="copy" label={copyLabel} size="sm" onPress={onCopy} />
      <IconButton icon="share" label={shareLabel} size="sm" onPress={onShare} />
    </div>
  );
}
