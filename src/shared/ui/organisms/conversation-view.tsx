import { useState, type ReactNode } from 'react';
import type { Conversation } from '@/shared/domain/conversation.types';
import type { OpenFileRequest } from '@/shared/domain/file-reference.types';
import type { MessageId } from '@/shared/domain/value-objects.types';
import { Icon } from '../atoms/icon';
import { ConversationMessages } from './conversation-messages';
import {
  buildConversationViewModel,
  toggleToolGroup
} from './conversation-view-model';
import './conversation-view.css';

export interface ConversationViewProps {
  /** The open conversation, served by the conversation port. */
  readonly conversation: Conversation;
  /**
   * The file the shell currently has requested, or `null`. Owned once by the
   * shell (the discipline #10 used for the active conversation); the view only
   * marks the matching chip.
   */
  readonly openFileRequest: OpenFileRequest | null;
  /** Emits an open-file request upward; the panel itself belongs to #12. */
  readonly onRequestOpenFile: (request: OpenFileRequest) => void;
  /** The composer dock the shell composes under the conversation (#6/#8). */
  readonly composer?: ReactNode;
}

/**
 * Organism: the conversation region that fills the main pane
 * (`docs/wireframes/README.md`, "Layout regions"; screens 11 and 12). It owns
 * the region chrome (the conversation header), the message list and the
 * composer dock, and it owns the **one** piece of ephemeral state the ticket
 * names: which tool-activity groups are collapsed. Keeping that set here — and
 * out of every row — is what stops the collapse state from being duplicated per
 * group.
 *
 * The open-file request is the exception: the shell owns it, so this organism
 * emits requests and marks the requested chip without ever resolving the file.
 */
export function ConversationView({
  conversation,
  openFileRequest,
  onRequestOpenFile,
  composer
}: ConversationViewProps) {
  const model = buildConversationViewModel(conversation);
  // The view tracks the collapsed groups, not the shown ones, so every group
  // starts expanded — the state screen 11 draws.
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<
    ReadonlySet<MessageId>
  >(() => new Set());

  function handleToggleGroup(groupId: MessageId) {
    setCollapsedGroupIds(current => toggleToolGroup(current, groupId));
  }

  return (
    <section className="conversation-view" aria-label={model.title}>
      <header className="conversation-view__header">
        <Icon name="folder" size="sm" />
        <h1 className="conversation-view__title">{model.title}</h1>
      </header>

      <div className="conversation-view__scroll">
        <ConversationMessages
          messages={model.messages}
          collapsedGroupIds={collapsedGroupIds}
          onToggleGroup={handleToggleGroup}
          openFileRequest={openFileRequest}
          onRequestOpenFile={onRequestOpenFile}
        />
      </div>

      {composer ? (
        <div className="conversation-view__composer">{composer}</div>
      ) : null}
    </section>
  );
}
