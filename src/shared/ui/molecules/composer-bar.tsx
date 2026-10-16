import type { ReactNode } from 'react';
import { getSharedMessages } from '@/shared/i18n/messages';
import { Button } from '../atoms/button';
import { Icon } from '../atoms/icon';
import './composer-bar.css';

export interface ComposerBarProps {
  /**
   * The selector chips the composer organism places between the add trigger and
   * the send control (provider, model, effort — #7).
   */
  readonly controls?: ReactNode;
  /**
   * Opens the composer's add menu. The menu it opens is not drawn by any
   * wireframe in scope, so this ticket ships the trigger and its seam only.
   */
  readonly onAddPress?: () => void;
  /** Hands the send intent up; the composer organism owns the submit rule. */
  readonly onSendPress?: () => void;
}

/**
 * Molecule: the composer's action row (`docs/wireframes/README.md`, "Reusable
 * components"). It composes the add and send atoms for one UI job and holds no
 * state — props down, events up — so the composer organism stays the only
 * place that knows the draft and when it is submittable.
 */
export function ComposerBar({
  controls,
  onAddPress,
  onSendPress
}: ComposerBarProps) {
  const messages = getSharedMessages();

  return (
    <div className="composer-bar">
      <Button
        variant="plain"
        label={messages.composer.addLabel}
        onPress={onAddPress}
      >
        <Icon name="plus" size="lg" />
      </Button>
      <div className="composer-bar__controls">
        {controls}
        <Button
          variant="solid"
          label={messages.composer.sendLabel}
          onPress={onSendPress}
        >
          <Icon name="send" size="sm" />
        </Button>
      </div>
    </div>
  );
}
