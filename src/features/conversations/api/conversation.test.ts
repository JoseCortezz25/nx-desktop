/**
 * Contract and client tests for the conversation catalog (issue #16, slice 2).
 *
 * The fixtures are the same JSON the Rust suite reads. The typed literals pin
 * messages, tool activity and file references; the client tests pin
 * `list_conversations` and the authority-bearing `create_conversation`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import createConversationFixture from '../../../../docs/ipc/fixtures/conversations-create-conversation.json';
import listConversationsFixture from '../../../../docs/ipc/fixtures/conversations-list-conversations.json';
import type {
  ConversationDto,
  CreateConversationRequestDto
} from './conversation.contracts';
import { createConversation, listConversations } from './conversation-client';

const ipcInvoke = vi.hoisted(() => vi.fn());

vi.mock('@/shared/ipc/client', () => ({ ipcInvoke }));

const expectedConversation: ConversationDto = {
  id: 'conv-composer-chain',
  projectId: 'proj-design-system',
  title: 'Composer selection chain',
  isPinned: true,
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-14T16:30:00.000Z',
  messages: [
    {
      id: 'msg-composer-1',
      role: 'user',
      content: 'Reconcile the provider, model, and effort selectors.',
      createdAt: '2026-10-01T09:00:05.000Z',
      toolCalls: []
    },
    {
      id: 'msg-composer-2',
      role: 'assistant',
      content:
        'Model ids are provider-scoped, so switching a provider resets the model.',
      createdAt: '2026-10-01T09:00:40.000Z',
      toolCalls: [
        {
          id: 'tool-composer-1',
          kind: 'search',
          summary: 'Searched src for the selection chain',
          detail: 'Matched selection-chain.ts and the composer organisms.',
          status: 'completed'
        },
        {
          id: 'tool-composer-2',
          kind: 'subagent',
          summary: 'Subagent Inspect repo completed',
          detail: 'Open the repository inspection child run.',
          status: 'completed',
          subagentId: 'subagent-inspect-repo'
        }
      ],
      fileReferences: [{ path: 'src/shared/domain/selection-chain.ts' }]
    }
  ]
};

const createdConversation: ConversationDto = {
  id: 'conv-created-1',
  projectId: 'proj-design-system',
  title: 'IPC contract review',
  isPinned: false,
  createdAt: '2026-10-18T12:00:00.000Z',
  updatedAt: '2026-10-18T12:00:00.000Z',
  messages: []
};

const expectedCreateRequest: CreateConversationRequestDto = {
  projectId: 'proj-design-system',
  title: 'IPC contract review'
};

beforeEach(() => {
  ipcInvoke.mockReset();
});

describe('conversation fixtures', () => {
  it('match the typed conversation catalog', () => {
    expect(listConversationsFixture.response).toEqual([expectedConversation]);
  });

  it('match the create request and created conversation', () => {
    expect(createConversationFixture.request).toEqual(expectedCreateRequest);
    expect(createConversationFixture.response).toEqual(createdConversation);
  });
});

describe('conversation client', () => {
  it('calls list_conversations without an envelope', async () => {
    ipcInvoke.mockResolvedValue([expectedConversation]);
    await expect(listConversations()).resolves.toEqual([expectedConversation]);
    expect(ipcInvoke).toHaveBeenCalledWith('list_conversations');
  });

  it('calls create_conversation with the project and title', async () => {
    ipcInvoke.mockResolvedValue(createdConversation);
    await expect(
      createConversation('proj-design-system', 'IPC contract review')
    ).resolves.toEqual(createdConversation);
    expect(ipcInvoke).toHaveBeenCalledWith('create_conversation', {
      request: expectedCreateRequest
    });
  });

  it('omits an absent title from the request envelope', async () => {
    ipcInvoke.mockResolvedValue(createdConversation);
    await createConversation('proj-design-system');
    expect(ipcInvoke).toHaveBeenCalledWith('create_conversation', {
      request: { projectId: 'proj-design-system' }
    });
  });
});
