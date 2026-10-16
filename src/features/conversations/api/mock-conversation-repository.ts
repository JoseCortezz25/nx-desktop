/**
 * In-memory conversation list used until the Rust core exposes
 * `list_conversations`.
 *
 * The seed mixes pinned and unpinned conversations with differing `updatedAt`
 * values so the sidebar's pinned/projects/recents groupings have something real
 * to slice.
 */
import type { Conversation } from '@/shared/domain/conversation.types';
import type { ConversationRepository } from './conversation-repository';

const conversations: readonly Conversation[] = [
  {
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
        toolCalls: [
          {
            id: 'tool-composer-1',
            kind: 'search',
            summary: 'Searched src for the selection chain',
            detail: 'Matched selection-chain.ts and the composer organisms.',
            status: 'completed'
          }
        ]
      },
      {
        id: 'msg-composer-2',
        role: 'assistant',
        content: 'Model ids are provider-scoped, so switching resets them.',
        createdAt: '2026-10-01T09:00:40.000Z',
        toolCalls: []
      }
    ]
  },
  {
    id: 'conv-diff-review',
    projectId: 'proj-design-system',
    title: 'Diff review panel',
    isPinned: false,
    createdAt: '2026-10-05T11:15:00.000Z',
    updatedAt: '2026-10-12T08:05:00.000Z',
    messages: [
      {
        id: 'msg-diff-1',
        role: 'user',
        content: 'Open the changed file in the right panel.',
        createdAt: '2026-10-05T11:15:10.000Z',
        toolCalls: []
      }
    ]
  },
  {
    id: 'conv-hooks-review',
    projectId: 'proj-api-client',
    title: 'Hooks review',
    isPinned: true,
    createdAt: '2026-09-28T14:00:00.000Z',
    updatedAt: '2026-10-09T18:45:00.000Z',
    messages: [
      {
        id: 'msg-hooks-1',
        role: 'user',
        content: 'Show the PreToolUse hooks before the command runs.',
        createdAt: '2026-09-28T14:00:12.000Z',
        toolCalls: []
      }
    ]
  }
];

/**
 * Builds a `ConversationRepository` backed by the mock list above. A factory
 * keeps the seam identical to the future IPC client.
 */
export function createMockConversationRepository(): ConversationRepository {
  return {
    listConversations() {
      return Promise.resolve(conversations);
    }
  };
}
