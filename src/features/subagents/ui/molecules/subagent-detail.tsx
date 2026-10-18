import type { ConversationMessage } from '@/shared/domain/conversation.types';
import { getSharedMessages } from '@/shared/i18n/messages';
import { Button } from '@/shared/ui/atoms/button';
import { Icon } from '@/shared/ui/atoms/icon';
import { IconButton } from '@/shared/ui/molecules/icon-button';
import {
  RECENT_TRANSCRIPT_COUNT,
  splitTranscript
} from '../../model/subagent-view';
import { SubagentAvatar } from '../atoms/subagent-avatar';
import './subagent-detail.css';

export interface SubagentDetailProps {
  readonly name: string;
  readonly avatarVariant: string;
  readonly statusLabel: string;
  readonly modelLabel: string;
  readonly effortLabel: string;
  readonly transcript: readonly ConversationMessage[];
  readonly canStop: boolean;
  readonly isEarlierExpanded: boolean;
  readonly onToggleEarlier: () => void;
  readonly onBack: () => void;
  readonly onStop?: () => void;
}

/** Molecule: controlled detail content; catalog and navigation stay with its owner. */
export function SubagentDetail({
  name,
  avatarVariant,
  statusLabel,
  modelLabel,
  effortLabel,
  transcript,
  canStop,
  isEarlierExpanded,
  onToggleEarlier,
  onBack,
  onStop
}: SubagentDetailProps) {
  const messages = getSharedMessages().subagents;
  const { earlier, recent } = splitTranscript(
    transcript,
    RECENT_TRANSCRIPT_COUNT
  );

  return (
    <div className="subagent-detail">
      <header className="subagent-detail__header">
        <IconButton
          icon="arrow-left"
          label={messages.detail.backLabel}
          onPress={onBack}
        />
        <SubagentAvatar variant={avatarVariant} label={name} />
        <div className="subagent-detail__identity">
          <h2 className="subagent-detail__name">{name}</h2>
          <span className="subagent-detail__meta">
            {messages.detail.metaLabel(modelLabel, effortLabel)}
          </span>
        </div>
        {canStop && onStop ? (
          <IconButton
            icon="square"
            label={messages.actions.stopLabel}
            onPress={onStop}
          />
        ) : null}
      </header>
      <span className="subagent-detail__status">{statusLabel}</span>
      <div
        className="subagent-detail__transcript"
        role="log"
        aria-label={messages.detail.transcriptLabel}
      >
        {isEarlierExpanded
          ? earlier.map(entry => <p key={entry.id}>{entry.content}</p>)
          : null}
        {earlier.length > 0 ? (
          <div className="subagent-detail__divider">
            <Button
              variant="plain"
              label={
                isEarlierExpanded
                  ? messages.detail.collapseLabel
                  : messages.detail.expandLabel
              }
              isExpanded={isEarlierExpanded}
              onPress={onToggleEarlier}
            >
              <span>{messages.detail.earlierLabel(earlier.length)}</span>
              <Icon name="chevron-down" size="sm" />
            </Button>
          </div>
        ) : null}
        {recent.map(entry => (
          <p key={entry.id}>{entry.content}</p>
        ))}
      </div>
    </div>
  );
}
