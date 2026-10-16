import { describe, expect, it } from 'vitest';
import type { Conversation } from '@/shared/domain/conversation.types';
import type { Project } from '@/shared/domain/project.types';
import { buildSidebarModel } from './sidebar-model';

function conversation(
  overrides: Partial<Conversation> & { readonly id: string }
): Conversation {
  return {
    projectId: 'proj-one',
    title: `Title ${overrides.id}`,
    messages: [],
    isPinned: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

const projects: readonly Project[] = [
  {
    id: 'proj-one',
    name: 'Design system',
    workspaceFolders: ['/workspace/one'],
    approvalMode: 'ask_always',
    hookDecisions: [],
    conversationIds: []
  },
  {
    id: 'proj-two',
    name: 'API client',
    workspaceFolders: ['/workspace/two'],
    approvalMode: 'auto_approve',
    hookDecisions: [],
    conversationIds: []
  }
];

const conversations: readonly Conversation[] = [
  conversation({
    id: 'conv-pinned',
    projectId: 'proj-one',
    title: 'Pinned one',
    isPinned: true,
    updatedAt: '2026-10-14T00:00:00.000Z'
  }),
  conversation({
    id: 'conv-two',
    projectId: 'proj-two',
    title: 'Recent two',
    updatedAt: '2026-10-12T00:00:00.000Z'
  }),
  conversation({
    id: 'conv-one',
    projectId: 'proj-one',
    title: 'Older one',
    updatedAt: '2026-10-09T00:00:00.000Z'
  })
];

describe('buildSidebarModel', () => {
  it('slices pinned conversations from their domain flag, not a local list', () => {
    const model = buildSidebarModel(conversations, projects, null);

    expect(model.pinned.map(row => row.id)).toEqual(['conv-pinned']);
  });

  it('moves a conversation between groups when the domain flag flips', () => {
    const before = buildSidebarModel(conversations, projects, null);
    expect(before.recents.map(row => row.id)).not.toContain('conv-pinned');

    const flipped = conversations.map(item =>
      item.id === 'conv-pinned' ? { ...item, isPinned: false } : item
    );
    const after = buildSidebarModel(flipped, projects, null);

    expect(after.pinned).toEqual([]);
    expect(after.recents.map(row => row.id)).toContain('conv-pinned');
  });

  it('orders recents by most recently updated first', () => {
    const model = buildSidebarModel(conversations, projects, null);

    expect(model.recents.map(row => row.id)).toEqual(['conv-two', 'conv-one']);
  });

  it('groups each project’s conversations and keeps the catalog order', () => {
    const model = buildSidebarModel(conversations, projects, null);

    expect(model.projects.map(group => group.id)).toEqual([
      'proj-one',
      'proj-two'
    ]);
    expect(model.projects[0]?.name).toBe('Design system');
    expect(model.projects[0]?.conversations.map(row => row.id)).toEqual([
      'conv-pinned',
      'conv-one'
    ]);
    expect(model.projects[1]?.conversations.map(row => row.id)).toEqual([
      'conv-two'
    ]);
  });

  it('marks only the active conversation, wherever it is drawn', () => {
    const model = buildSidebarModel(conversations, projects, 'conv-pinned');

    const active = [
      ...model.pinned,
      ...model.recents,
      ...model.projects.flatMap(group => group.conversations)
    ].filter(row => row.isActive);

    expect(active.map(row => row.id)).toEqual(['conv-pinned', 'conv-pinned']);
    expect(
      model.recents.every(row => row.id === 'conv-pinned' || !row.isActive)
    ).toBe(true);
  });

  it('draws an empty projection while the ports are still loading', () => {
    expect(buildSidebarModel([], [], null)).toEqual({
      pinned: [],
      projects: [],
      recents: []
    });
  });
});
