import { describe, expect, it } from 'vitest';
import type { Conversation } from '@/shared/domain/conversation.types';
import type { MessageId } from '@/shared/domain/value-objects.types';
import {
  buildConversationViewModel,
  createOpenFileRequest,
  formatMessageTime,
  toggleToolGroup
} from './conversation-view-model';

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
        },
        {
          id: 'tool-2',
          kind: 'command',
          summary: 'Ran pnpm test',
          detail: 'All tests passed.',
          status: 'completed'
        },
        {
          id: 'tool-3',
          kind: 'list_files',
          summary: 'Listed src/shared/domain',
          detail: 'Three files.',
          status: 'completed'
        }
      ],
      fileReferences: [{ path: 'src/App.tsx' }]
    }
  ]
};

describe('conversation view model', () => {
  it('projects every message with its role and formatted timestamp', () => {
    const model = buildConversationViewModel(conversation);

    expect(model.id).toBe('conv-1');
    expect(model.title).toBe('Composer selection chain');
    expect(model.messages.map(message => message.role)).toEqual([
      'user',
      'assistant'
    ]);
    expect(model.messages.map(message => message.timestamp)).toEqual([
      '09:00',
      '09:02'
    ]);
  });

  it('maps each tool call kind to its glyph and keeps file references', () => {
    const model = buildConversationViewModel(conversation);

    expect(model.messages[0]?.toolActivity).toBeNull();
    expect(model.messages[0]?.fileReferences).toEqual([]);

    const group = model.messages[1]?.toolActivity;
    expect(group?.id).toBe('msg-assistant');
    expect(group?.rows.map(row => row.icon)).toEqual([
      'search',
      'terminal',
      'folder'
    ]);
    expect(model.messages[1]?.fileReferences).toEqual([
      { path: 'src/App.tsx' }
    ]);
  });

  it('makes only diff activity open the changes', () => {
    const model = buildConversationViewModel({
      ...conversation,
      messages: [
        {
          ...conversation.messages[1]!,
          toolCalls: [
            {
              id: 'diff-1',
              kind: 'diff',
              summary: 'Ran git diff',
              detail: '',
              status: 'completed'
            },
            {
              id: 'command-1',
              kind: 'command',
              summary: 'Ran tests',
              detail: '',
              status: 'completed'
            }
          ]
        }
      ]
    });
    expect(model.messages[0]?.toolActivity?.rows).toEqual([
      {
        id: 'diff-1',
        icon: 'git-branch',
        summary: 'Ran git diff',
        opensChanges: true
      },
      {
        id: 'command-1',
        icon: 'terminal',
        summary: 'Ran tests',
        opensChanges: false
      }
    ]);
    expect(
      buildConversationViewModel(
        conversation
      ).messages[1]?.toolActivity?.rows.map(row => row.opensChanges)
    ).toEqual([false, false, false]);
  });

  it('carries the actions row on assistant turns only', () => {
    const model = buildConversationViewModel(conversation);

    expect(model.messages[0]?.showsActions).toBe(false);
    expect(model.messages[1]?.showsActions).toBe(true);
  });

  it('formats the message time from the ISO timestamp', () => {
    expect(formatMessageTime('2026-10-01T09:02:44.000Z')).toBe('09:02');
    expect(formatMessageTime('2026-10-01T00:00:00.000Z')).toBe('00:00');
  });

  it('flips one group at a time without mutating the input', () => {
    const initial: ReadonlySet<MessageId> = new Set<MessageId>(['msg-a']);

    const collapsed = toggleToolGroup(initial, 'msg-b');
    expect(initial.has('msg-b')).toBe(false);
    expect(collapsed.has('msg-b')).toBe(true);
    expect(collapsed).not.toBe(initial);

    const reExpanded = toggleToolGroup(collapsed, 'msg-b');
    expect(reExpanded.has('msg-b')).toBe(false);
    expect(reExpanded.has('msg-a')).toBe(true);
  });

  it('builds the open-file request a chip emits from its path', () => {
    expect(createOpenFileRequest('src/App.tsx')).toEqual({
      path: 'src/App.tsx'
    });
  });
});
