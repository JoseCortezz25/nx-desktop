import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Conversation } from '@/shared/domain/conversation.types';
import type { Project } from '@/shared/domain/project.types';
import { Sidebar, type SidebarProps } from './sidebar';

/**
 * The suite drives the sidebar's *wiring* — which callback a row reports to —
 * rather than its DOM. The component now uses hooks (the narrow-window drawer
 * manages focus), so it can no longer be called as a plain function to read its
 * element tree. Instead the two children whose callbacks the tests drive record
 * the props they receive while rendering the real component; that is the same
 * capture pattern the shell seam suites use.
 */
const recorded = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  buttons: [] as Record<string, unknown>[]
}));

/** The real child, recovered from the module the mock replaced. */
type ChildComponent = (props: Record<string, unknown>) => ReactElement;

vi.mock('../molecules/conversation-row', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '../molecules/conversation-row'
  );
  const Actual = actual.ConversationRow as ChildComponent;
  return {
    ConversationRow: (props: Record<string, unknown>) => {
      recorded.rows.push(props);
      return createElement(Actual, props);
    }
  };
});

vi.mock('../atoms/button', async () => {
  const actual =
    await vi.importActual<Record<string, unknown>>('../atoms/button');
  const Actual = actual.Button as ChildComponent;
  return {
    Button: (props: Record<string, unknown>) => {
      recorded.buttons.push(props);
      return createElement(Actual, props);
    }
  };
});

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
      projects={projects}
      conversations={conversations}
      activeConversationId={null}
      onSelectConversation={() => undefined}
      onNewChat={() => undefined}
      {...overrides}
    />
  );
}

describe('sidebar', () => {
  beforeEach(() => {
    recorded.rows = [];
    recorded.buttons = [];
  });

  it('renders the application brand and the three groups', () => {
    const markup = renderSidebar();

    // #41 supersedes #10's provider brand: the header carries the application
    // identity, so a provider name can never leak into it again.
    expect(markup).toContain('<span class="sidebar__brand-name">Nx</span>');
    expect(markup).not.toContain('Codex');
    expect(markup).toContain('Fijados');
    expect(markup).toContain('Proyectos');
    expect(markup).toContain('Recientes');
  });

  it('leaves the deferred notifications, search and chevron affordances out', () => {
    const markup = renderSidebar();

    // #41 defers both tools and removes the chevron: the header is the static
    // brand alone, with no placeholder, no handler and no disclosure icon.
    expect(markup).toContain(
      '<div class="sidebar__header"><span class="sidebar__brand"><span class="sidebar__brand-name">Nx</span></span></div>'
    );
    expect(markup).not.toContain('sidebar__tools');
    expect(markup).not.toContain('Notificaciones');
    expect(markup).not.toContain('Buscar');
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
    renderSidebar({ onSelectConversation });

    const hooksRow = recorded.rows.find(row => row.title === 'Hooks review');
    expect(hooksRow).toBeDefined();
    (hooksRow?.onSelect as (() => void) | undefined)?.();

    expect(onSelectConversation).toHaveBeenCalledWith('conv-hooks');
  });

  it('draws a plain column frame by default and a drawer when overlaid (#43)', () => {
    const inline = renderSidebar();
    expect(inline).toContain('class="sidebar"');
    expect(inline).not.toContain('sidebar--overlay');

    const overlay = renderSidebar({ isOverlay: true });
    expect(overlay).toContain('class="sidebar sidebar--overlay"');
    // The drawer is a focus target so Escape can dismiss it.
    expect(overlay).toContain('tabindex="-1"');
  });

  it('wires the new-chat row to the home action the shell hands down', () => {
    const onNewChat = vi.fn();
    renderSidebar({ activeConversationId: 'conv-diff', onNewChat });

    // The new-chat row is the first `list`-variant button; pressing it reports
    // the home destination so the shell can clear the open conversation (#40,
    // criterion 1).
    const newChat = recorded.buttons.find(button => button.variant === 'list');
    expect(newChat).toBeDefined();

    (newChat?.onPress as (() => void) | undefined)?.();

    expect(onNewChat).toHaveBeenCalledTimes(1);
  });
});
