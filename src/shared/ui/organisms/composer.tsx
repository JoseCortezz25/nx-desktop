import { useState } from 'react';
import { getSharedMessages } from '@/shared/i18n/messages';
import { TextArea } from '../atoms/text-area';
import { ComposerBar } from '../molecules/composer-bar';
import {
  EMPTY_COMPOSER_DRAFT,
  submitDraft,
  typeInDraft
} from './composer-draft';
import './composer.css';

export interface ComposerProps {
  /**
   * Display name of the active provider, resolved by the shell root from the
   * typed provider port. `null` while the catalog loads, which leaves the field
   * without a placeholder rather than naming a provider here.
   */
  readonly providerName: string | null;
  /** Handed the submitted prompt text. */
  readonly onSubmit: (prompt: string) => void;
}

/**
 * Organism: the composer (`docs/wireframes/README.md`, "Reusable components").
 *
 * This ticket ships the surface's core — the prompt field, the add trigger and
 * the send control — as an organism/molecule/atom split that holds its own
 * draft. The provider/model/effort chips (#7) and the approval chip (#8) are
 * theirs to add; the microphone is out of scope.
 */
export function Composer({ providerName, onSubmit }: ComposerProps) {
  const messages = getSharedMessages();
  const [draft, setDraft] = useState(EMPTY_COMPOSER_DRAFT);

  // Derived during render, not stored: the placeholder follows the active
  // provider without an effect.
  const placeholder = providerName
    ? messages.composer.promptPlaceholder(providerName)
    : undefined;

  function handlePromptChange(text: string) {
    setDraft(typeInDraft(text));
  }

  function handleSend() {
    // Reads the current draft rather than a state updater: `submitDraft` calls
    // `onSubmit`, and an updater must stay side-effect free (React may invoke it
    // twice in StrictMode).
    setDraft(submitDraft(draft, onSubmit));
  }

  return (
    <div className="composer">
      <TextArea
        label={messages.composer.promptLabel}
        value={draft.text}
        placeholder={placeholder}
        onChange={handlePromptChange}
      />
      <ComposerBar onSendPress={handleSend} />
    </div>
  );
}
