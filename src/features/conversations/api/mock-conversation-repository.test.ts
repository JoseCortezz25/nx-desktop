import { describe, expect, it } from 'vitest';
import { subagentRepositorySeed } from '@/features/subagents/api/mock-subagent-repository';
import { buildConversationViewModel } from '@/shared/ui/organisms/conversation-view-model';
import { createMockConversationRepository } from './mock-conversation-repository';

describe('mock conversation repository', () => {
  it('makes both demo child runs reachable from assistant activity without losing file or diff openers', async () => {
    const conversations =
      await createMockConversationRepository().listConversations();
    const messages = conversations.flatMap(
      conversation => conversation.messages
    );
    const rows = messages
      .filter(message => message.role === 'assistant')
      .flatMap(message => message.toolCalls)
      .filter(call => call.kind === 'subagent');
    expect(rows.map(row => row.subagentId)).toEqual([
      'subagent-inspect-repo',
      'subagent-tauri-research'
    ]);
    const ids = subagentRepositorySeed().map(agent => agent.id);
    for (const row of rows) {
      expect(ids).toContain(row.subagentId);
      expect(row.detail.length).toBeGreaterThan(0);
    }
    const projectedRows = conversations
      .flatMap(
        conversation => buildConversationViewModel(conversation).messages
      )
      .flatMap(message => message.toolActivity?.rows ?? []);
    expect(
      projectedRows
        .filter(row => row.opensSubagentId)
        .map(row => row.opensSubagentId)
    ).toEqual(['subagent-inspect-repo', 'subagent-tauri-research']);
    expect(projectedRows.some(row => row.opensChanges)).toBe(true);
    expect(messages.some(message => message.fileReferences?.length)).toBe(true);
  });
});
