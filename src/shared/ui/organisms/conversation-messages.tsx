import type { OpenFileRequest } from '@/shared/domain/file-reference.types';
import type { MessageId } from '@/shared/domain/value-objects.types';
import { getSharedMessages } from '@/shared/i18n/messages';
import { FileChip } from '../atoms/file-chip';
import { MessageActions } from '../molecules/message-actions';
import { MessageMeta } from '../molecules/message-meta';
import { ToolActivityGroup } from '../molecules/tool-activity-group';
import type { ConversationMessageView } from './conversation-view-model';
import './conversation-messages.css';

export interface ConversationMessagesProps {
  /** The messages to draw, already projected from the conversation domain. */
  readonly messages: readonly ConversationMessageView[];
  /** Group ids currently collapsed; owned once by the conversation region. */
  readonly collapsedGroupIds: ReadonlySet<MessageId>;
  readonly onToggleGroup: (groupId: MessageId) => void;
  /** The file the shell currently has requested, or `null`. */
  readonly openFileRequest: OpenFileRequest | null;
  /** Emits the open-file request a file chip produces. */
  readonly onRequestOpenFile: (request: OpenFileRequest) => void;
}

/**
 * Organism: the conversation's message list (`docs/wireframes/README.md`, screens
 * 11 and 12). It composes the tool-activity group, the inline file chips and the
 * actions row for every message. It holds no state — the collapse owner and the
 * open-file request are handed down — so it can be exercised without a DOM.
 */
export function ConversationMessages({
  messages: items,
  collapsedGroupIds,
  onToggleGroup,
  openFileRequest,
  onRequestOpenFile
}: ConversationMessagesProps) {
  const messages = getSharedMessages();

  function handleOpenFile(path: string) {
    // The view only emits; the shell owns the request and never resolves it here.
    onRequestOpenFile({ path });
  }

  return (
    <div className="conversation-messages">
      {items.map(message => (
        <article
          key={message.id}
          className={`conversation-message conversation-message--${message.role}`}
        >
          {message.toolActivity ? (
            <ToolActivityGroup
              summary={messages.conversation.toolActivity.count(
                message.toolActivity.rows.length
              )}
              expandLabel={messages.conversation.toolActivity.expandLabel}
              collapseLabel={messages.conversation.toolActivity.collapseLabel}
              isExpanded={!collapsedGroupIds.has(message.id)}
              rows={message.toolActivity.rows}
              onToggle={() => onToggleGroup(message.id)}
            />
          ) : null}

          <p className="conversation-message__text">{message.content}</p>

          {message.fileReferences.length > 0 ? (
            <div className="conversation-message__files">
              {message.fileReferences.map(reference => (
                <FileChip
                  key={reference.path}
                  path={reference.path}
                  label={messages.conversation.fileChip.openLabel(
                    reference.path
                  )}
                  isActive={reference.path === openFileRequest?.path}
                  onOpen={handleOpenFile}
                />
              ))}
            </div>
          ) : null}

          <div className="conversation-message__footer">
            {message.showsActions ? (
              <MessageActions
                copyLabel={messages.conversation.message.copyLabel}
                feedbackLabel={messages.conversation.message.feedbackLabel}
                shareLabel={messages.conversation.message.shareLabel}
                onCopy={() => undefined}
                onFeedback={() => undefined}
                onShare={() => undefined}
              />
            ) : null}
            <MessageMeta
              time={message.timestamp}
              timestampLabel={messages.conversation.message.timestampLabel(
                message.timestamp
              )}
              editLabel={messages.conversation.message.editLabel}
              onEdit={() => undefined}
            />
          </div>
        </article>
      ))}
    </div>
  );
}
