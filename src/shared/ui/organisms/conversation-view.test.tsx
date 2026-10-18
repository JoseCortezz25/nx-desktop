import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Conversation } from '@/shared/domain/conversation.types';
import { getSharedMessages } from '@/shared/i18n/messages';
import { ConversationView } from './conversation-view';

const conversation: Conversation = {
  id: 'conv-1',
  projectId: 'proj-1',
  title: 'Composer selection chain',
  isPinned: true,
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-01T09:03:00.000Z',
  messages: [
    {
      id: 'msg-assistant',
      role: 'assistant',
      content: 'Model ids are provider-scoped.',
      createdAt: '2026-10-01T09:02:44.000Z',
      toolCalls: [],
      fileReferences: [{ path: 'src/App.tsx' }]
    }
  ]
};

describe('conversation view', () => {
  it('draws the conversation title and the composer the shell slots in', () => {
    const markup = renderToStaticMarkup(
      <ConversationView
        conversation={conversation}
        openFileRequest={null}
        onRequestOpenFile={() => undefined}
        onRequestOpenChanges={() => undefined}
        composer={<span>composer-dock</span>}
      />
    );

    expect(markup).toContain('Composer selection chain');
    expect(markup).toContain('composer-dock');
  });

  it('threads the subagent detail affordance through the messages while leaving unrelated tools inert', () => {
    const markup = renderToStaticMarkup(
      <ConversationView
        conversation={{
          ...conversation,
          messages: [
            {
              ...conversation.messages[0]!,
              toolCalls: [
                {
                  id: 'child',
                  kind: 'subagent',
                  summary: 'Inspect repo completed',
                  detail: '',
                  status: 'completed',
                  subagentId: 'subagent-inspect-repo'
                },
                {
                  id: 'command',
                  kind: 'command',
                  summary: 'Ran tests',
                  detail: '',
                  status: 'completed'
                }
              ]
            }
          ]
        }}
        openFileRequest={null}
        onRequestOpenFile={() => undefined}
        onRequestOpenChanges={() => undefined}
        onRequestOpenSubagent={() => undefined}
      />
    );
    expect(markup).toContain(
      'aria-label="Ver el subagente en el panel derecho"'
    );
    expect(markup).toContain('Inspect repo completed');
    expect(markup).toContain('Ran tests');
    expect(
      markup.match(/aria-label="Ver el subagente en el panel derecho"/g)
    ).toHaveLength(1);
  });

  it('threads the open-changes affordance through the message group', () => {
    const markup = renderToStaticMarkup(
      <ConversationView
        conversation={{
          ...conversation,
          messages: [
            {
              ...conversation.messages[0]!,
              toolCalls: [
                {
                  id: 'diff',
                  kind: 'diff',
                  summary: 'Ran git diff',
                  detail: '',
                  status: 'completed'
                }
              ]
            }
          ]
        }}
        openFileRequest={null}
        onRequestOpenFile={() => undefined}
        onRequestOpenChanges={() => undefined}
      />
    );
    expect(markup).toContain(
      `aria-label="${getSharedMessages().conversation.toolActivity.openChangesLabel}"`
    );
    expect(markup).toContain('Ran git diff');
  });

  it('marks the chip whose open-file request the shell owns', () => {
    const markup = renderToStaticMarkup(
      <ConversationView
        conversation={conversation}
        openFileRequest={{ path: 'src/App.tsx' }}
        onRequestOpenChanges={() => undefined}
        onRequestOpenFile={() => undefined}
      />
    );

    expect(markup).toContain('file-chip--active');
  });
});
