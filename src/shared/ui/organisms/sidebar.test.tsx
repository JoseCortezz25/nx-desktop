import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Conversation } from '@/shared/domain/conversation.types';
import type { Project } from '@/shared/domain/project.types';
import { Button, type ButtonProps } from '../atoms/button';
import {
  ConversationRow,
  type ConversationRowProps
} from '../molecules/conversation-row';
import { Sidebar, type SidebarProps } from './sidebar';

const projects: readonly Project[] = [
  {
    id: 'proj-design',
    name: 'Design system',
    workspaceFolders: ['/workspace/design'],
    approvalMode: 'ask_always',
    hookDecisions: [],
    conversationIds: []
  },
  {
    id: 'proj-api',
    name: 'API client',
    workspaceFolders: ['/workspace/api'],
    approvalMode: 'auto_approve',
    hookDecisions: [],
    conversationIds: []
  }
];

const conversations: readonly Conversation[] = [
  {
    id: 'conv-pinned',
    projectId: 'proj-design',
    title: 'Composer selection chain',
    messages: [],
    isPinned: true,
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-14T16:30:00.000Z'
  },
  {
    id: 'conv-diff',
    projectId: 'proj-design',
    title: 'Diff review panel',
    messages: [],
    isPinned: false,
    createdAt: '2026-10-05T11:15:00.000Z',
    updatedAt: '2026-10-12T08:05:00.000Z'
  },
  {
    id: 'conv-hooks',
    projectId: 'proj-api',
    title: 'Hooks review',
    messages: [],
    isPinned: false,
    createdAt: '2026-09-28T14:00:00.000Z',
    updatedAt: '2026-10-09T18:45:00.000Z'
  }
];

function renderSidebar(overrides: Partial<SidebarProps> = {}) {
  return renderToStaticMarkup(
    <Sidebar
      providerName="Codex"
      projects={projects}
      conversations={conversations}
      activeConversationId={null}
      onSelectConversation={() => undefined}
      onNewChat={() => undefined}
      {...overrides}
    />
  );
}

/** Collects the conversation rows a sidebar render produced (no DOM needed). */
function collectRows(node: ReactNode): ReactElement<ConversationRowProps>[] {
  const found: ReactElement<ConversationRowProps>[] = [];

  function visit(current: ReactNode) {
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (!isValidElement(current)) {
      return;
    }
    if (current.type === ConversationRow) {
      found.push(current as ReactElement<ConversationRowProps>);
      return;
    }
    visit((current.props as { children?: ReactNode }).children);
  }

  visit(node);
  return found;
}

/** Collects the `Button` atoms a sidebar render produced (no DOM needed). */
function collectButtons(node: ReactNode): ReactElement<ButtonProps>[] {
  const found: ReactElement<ButtonProps>[] = [];

  function visit(current: ReactNode) {
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (!isValidElement(current)) {
      return;
    }
    if (current.type === Button) {
      found.push(current as ReactElement<ButtonProps>);
      return;
    }
    visit((current.props as { children?: ReactNode }).children);
  }

  visit(node);
  return found;
}

describe('sidebar', () => {
  it('renders the active provider brand and the three groups', () => {
    const markup = renderSidebar();

    expect(markup).toContain('<span class="sidebar__brand-name">Codex</span>');
    expect(markup).toContain('Fijados');
    expect(markup).toContain('Proyectos');
    expect(markup).toContain('Recientes');
  });

  it('draws pinned, project-nested and recent conversations from the ports', () => {
    const markup = renderSidebar();

    expect(markup).toContain('Composer selection chain');
    expect(markup).toContain('Diff review panel');
    expect(markup).toContain('Hooks review');
    expect(markup).toContain('Design system');
    expect(markup).toContain('API client');
  });

  it('marks the open conversation where it is drawn, and nothing else', () => {
    const none = renderSidebar({ activeConversationId: null });
    expect(none).not.toContain('button--active');
    expect(none).not.toContain('aria-current');

    const active = renderSidebar({ activeConversationId: 'conv-diff' });

    // 'Diff review panel' is drawn once under its project and once in recents;
    // both rows carry the active mark, and no other conversation does.
    expect(active.match(/aria-current="page"/g)?.length).toBe(2);
    expect(
      active.match(
        /aria-current="page"><span class="conversation-row__title">Diff review panel<\/span>/g
      )?.length
    ).toBe(2);
    expect(active).not.toContain(
      'aria-current="page"><span class="conversation-row__title">Hooks review'
    );
  });

  it('reports the pressed conversation up, one owner of the selection', () => {
    const onSelectConversation = vi.fn();
    const rows = collectRows(
      Sidebar({
        providerName: 'Codex',
        projects,
        conversations,
        activeConversationId: null,
        onSelectConversation,
        onNewChat: () => undefined
      })
    );

    const hooksRow = rows.find(row => row.props.title === 'Hooks review');
    hooksRow?.props.onSelect();

    expect(onSelectConversation).toHaveBeenCalledWith('conv-hooks');
  });

  it('wires the new-chat row to the home action the shell hands down', () => {
    const onNewChat = vi.fn();
    const buttons = collectButtons(
      Sidebar({
        providerName: 'Codex',
        projects,
        conversations,
        activeConversationId: 'conv-diff',
        onSelectConversation: () => undefined,
        onNewChat
      })
    );

    // The new-chat row is the only `list`-variant button; pressing it reports the
    // home destination so the shell can clear the open conversation (#40,
    // criterion 1).
    const newChat = buttons.find(button => button.props.variant === 'list');
    expect(newChat).toBeDefined();

    newChat?.props.onPress?.();

    expect(onNewChat).toHaveBeenCalledTimes(1);
  });
});
