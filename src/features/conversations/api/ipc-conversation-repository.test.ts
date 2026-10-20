/**
 * Repository tests for the IPC-backed conversation catalog (issue #22).
 *
 * The client module is mocked at its boundary; the tests pin the nested
 * mapping (messages, tool activity, inline file references) the sidebar and
 * conversation view consume.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createIpcConversationRepository } from './ipc-conversation-repository';
import type { ConversationDto } from './conversation.contracts';

const listConversations = vi.hoisted(() => vi.fn());

vi.mock('./conversation-client', () => ({ listConversations }));

const conversation: ConversationDto = {
  id: 'conv-composer-chain',
  projectId: 'proj-design-system',
  title: 'Composer selection chain',
  messages: [
    {
      id: 'msg-1',
      role: 'assistant',
      content: 'Model ids are provider-scoped.',
      createdAt: '2026-10-01T09:00:40.000Z',
      toolCalls: [
        {
          id: 'tool-1',
          kind: 'subagent',
          summary: 'Subagent Inspect repo completed',
          detail: 'Open the child run.',
          status: 'completed',
          subagentId: 'subagent-inspect-repo'
        }
      ],
      fileReferences: [{ path: 'src/shared/domain/selection-chain.ts' }]
    },
    {
      id: 'msg-2',
      role: 'user',
      content: 'Where does the reset happen?',
      createdAt: '2026-10-01T09:02:10.000Z',
      toolCalls: []
    }
  ],
  isPinned: true,
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-14T16:30:00.000Z'
};

beforeEach(() => {
  listConversations.mockReset();
});

describe('createIpcConversationRepository', () => {
  it('maps the Rust catalog including tool activity and file references', async () => {
    listConversations.mockResolvedValue([conversation]);

    const conversations =
      await createIpcConversationRepository().listConversations();

    expect(listConversations).toHaveBeenCalledOnce();
    expect(conversations[0].messages[0].toolCalls[0].subagentId).toBe(
      'subagent-inspect-repo'
    );
    expect(conversations[0].messages[0].fileReferences).toEqual([
      { path: 'src/shared/domain/selection-chain.ts' }
    ]);
    expect(conversations[0].messages[1].fileReferences).toBeUndefined();
    expect(conversations[0].isPinned).toBe(true);
  });

  it('propagates a rejected client call', async () => {
    listConversations.mockRejectedValue(new Error('ipc unavailable'));
    await expect(
      createIpcConversationRepository().listConversations()
    ).rejects.toThrow('ipc unavailable');
  });
});
