import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Conversation } from '@/shared/domain/conversation.types';
import { getSharedMessages } from '@/shared/i18n/messages';
import { FileChip, type FileChipProps } from '../atoms/file-chip';
import {
  ConversationMessages,
  type ConversationMessagesProps
} from './conversation-messages';
import { buildConversationViewModel } from './conversation-view-model';

const conversation: Conversation = {
  id: 'conv-1',
  projectId: 'proj-1',
  title: 'Composer selection chain',
  isPinned: true,
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-01T09:03:00.000Z',
  messages: [
    {
      id: 'msg-user',
      role: 'user',
      content: 'Reconcile the selectors.',
      createdAt: '2026-10-01T09:00:05.000Z',
      toolCalls: []
    },
    {
      id: 'msg-assistant',
      role: 'assistant',
      content: 'Model ids are provider-scoped.',
      createdAt: '2026-10-01T09:02:44.000Z',
      toolCalls: [
        {
          id: 'tool-1',
          kind: 'search',
          summary: 'Searched src',
          detail: 'Matched selection-chain.ts.',
          status: 'completed'
        }
      ],
      fileReferences: [{ path: 'src/App.tsx' }, { path: 'src/lib.rs' }]
    }
  ]
};

const model = buildConversationViewModel(conversation);

function renderMessages(
  overrides: Partial<ConversationMessagesProps> = {}
): string {
  return renderToStaticMarkup(
    <ConversationMessages
      messages={model.messages}
      collapsedGroupIds={new Set()}
      onToggleGroup={() => undefined}
      openFileRequest={null}
      onRequestOpenFile={() => undefined}
      onRequestOpenChanges={() => undefined}
      {...overrides}
    />
  );
}

/** Collects the file chips a render produced without mounting a DOM. */
function collectFileChips(node: ReactNode): ReactElement<FileChipProps>[] {
  const found: ReactElement<FileChipProps>[] = [];

  function visit(current: ReactNode) {
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (!isValidElement(current)) {
      return;
    }
    if (current.type === FileChip) {
      found.push(current as ReactElement<FileChipProps>);
      return;
    }
    visit((current.props as { children?: ReactNode }).children);
  }

  visit(node);
  return found;
}

describe('conversation messages', () => {
  it('emits the open-file request a file chip produces, carrying its path', () => {
    const onRequestOpenFile = vi.fn();

    const chips = collectFileChips(
      ConversationMessages({
        messages: model.messages,
        collapsedGroupIds: new Set(),
        onToggleGroup: () => undefined,
        openFileRequest: null,
        onRequestOpenChanges: () => undefined,
        onRequestOpenFile
      })
    );
    expect(chips.map(chip => chip.props.path)).toEqual([
      'src/App.tsx',
      'src/lib.rs'
    ]);

    const appChip = chips.find(chip => chip.props.path === 'src/App.tsx');
    appChip?.props.onOpen('src/App.tsx');

    expect(onRequestOpenFile).toHaveBeenCalledTimes(1);
    expect(onRequestOpenFile).toHaveBeenCalledWith({ path: 'src/App.tsx' });
  });

  it('marks only the chip whose file is currently requested', () => {
    const markup = renderMessages({ openFileRequest: { path: 'src/lib.rs' } });

    expect(
      markup.match(/file-chip--active/g)?.length,
      'exactly one chip is marked'
    ).toBe(1);
    expect(markup).toContain(
      'aria-label="Abrir src/lib.rs"><svg class="icon icon--sm"'
    );
  });

  it('renders the timestamp and edit affordances below the message, reading their copy from messages.ts', () => {
    const messages = getSharedMessages();
    const markup = renderMessages();
    const assistantTimestampLabel =
      messages.conversation.message.timestampLabel('09:02');

    expect(markup).toContain(
      `aria-label="${messages.conversation.message.editLabel}"`
    );
    expect(markup).toContain(`aria-label="${assistantTimestampLabel}"`);

    // Below the bubble: the assistant text precedes its own affordances in the
    // DOM (the user turn's own affordances sit after it, earlier in the page).
    const textIndex = markup.indexOf('Model ids are provider-scoped.');
    const timestampIndex = markup.indexOf(
      `aria-label="${assistantTimestampLabel}"`
    );
    expect(textIndex).toBeGreaterThanOrEqual(0);
    expect(timestampIndex).toBeGreaterThan(textIndex);
    expect(markup).toContain('>09:02</span>');
  });

  it('renders the actions row from the shared copy', () => {
    const messages = getSharedMessages();
    const markup = renderMessages();

    expect(markup).toContain(
      `aria-label="${messages.conversation.message.copyLabel}"`
    );
    expect(markup).toContain(
      `aria-label="${messages.conversation.message.feedbackLabel}"`
    );
    expect(markup).toContain(
      `aria-label="${messages.conversation.message.shareLabel}"`
    );
  });

  it('draws the tool-activity group for a message that ran tools', () => {
    const markup = renderMessages();

    expect(markup).toContain('1 acción');
    expect(markup).toContain('Searched src');
  });
});
