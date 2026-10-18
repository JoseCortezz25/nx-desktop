import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Conversation } from '@/shared/domain/conversation.types';
import type { OpenFileRequest } from '@/shared/domain/file-reference.types';
import type { Project } from '@/shared/domain/project.types';
import type { Provider } from '@/shared/domain/provider.types';
import { EMPTY_COMPOSER_DRAFT } from '@/shared/ui/organisms/composer-draft';

/**
 * The navigation seam #40 closes, exercised through the shell's **real wiring**.
 *
 * Static rendering runs no events, so the suite captures the props the shell
 * hands its children and drives the callbacks it wired. The shell delegates each
 * callback to a `shell-state` transition, and this suite spies those transitions
 * with `vi.fn` wrappers around the real implementations, so a press is proven to
 * reach the rule the acceptance criteria name — not merely that the rule exists.
 *
 * The three transitions a criterion covers: the Home return (`navigateHome`, one
 * handler behind **both** entry points), the file request that reveals the panel
 * (`revealFileInPanel`), and the shell-owned draft the composer is handed.
 */
const capture = vi.hoisted(() => ({
  rail: null as Record<string, unknown> | null,
  sidebar: null as Record<string, unknown> | null,
  homeView: null as Record<string, unknown> | null,
  conversationView: null as Record<string, unknown> | null,
  filePanel: null as Record<string, unknown> | null,
  navigateHome: vi.fn(),
  revealFileInPanel: vi.fn(),
  revealChangesInPanel: vi.fn(),
  actual: {} as Record<string, unknown>,
  /** The shell's initial state, seeded to the conversation-open defect state. */
  shellState: {
    activeConversationId: 'conv-composer-chain' as string | null,
    visibility: { sidebar: true, rightPanel: false },
    openFileRequest: null as OpenFileRequest | null,
    openChangesRequestCount: 0,
    hookReview: { isOpen: false, selectedHookIds: new Set<string>() }
  }
}));

vi.mock('@/shared/ui/organisms/rail', () => ({
  Rail: (props: Record<string, unknown>) => {
    capture.rail = props;
    return null;
  }
}));

vi.mock('@/shared/ui/organisms/sidebar', () => ({
  Sidebar: (props: Record<string, unknown>) => {
    capture.sidebar = props;
    return null;
  }
}));

vi.mock('@/shared/ui/organisms/home-view', () => ({
  HomeView: (props: Record<string, unknown>) => {
    capture.homeView = props;
    return null;
  }
}));

vi.mock('@/shared/ui/organisms/conversation-view', () => ({
  ConversationView: (props: Record<string, unknown>) => {
    capture.conversationView = props;
    return null;
  }
}));

vi.mock('@/features/files/ui/organisms/file-panel', () => ({
  FilePanel: (props: Record<string, unknown>) => {
    capture.filePanel = props;
    return null;
  }
}));

/**
 * The region presentation the shell resolves from the window width. Seeded
 * directly (the policy and the browser geometry are covered elsewhere) so this
 * suite can assert the sidebar wiring deterministically in the node runner.
 */
const layout = vi.hoisted(() => ({
  value: { sidebar: 'inline', rightPanel: 'inline' } as {
    sidebar: 'inline' | 'overlay';
    rightPanel: 'inline' | 'overlay';
  }
}));

vi.mock('@/shared/ui/layout/region-visibility', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '@/shared/ui/layout/region-visibility'
  );
  return { ...actual, resolveRegionLayout: () => layout.value };
});

vi.mock('./shell-state', async () => {
  const actual =
    await vi.importActual<Record<string, unknown>>('./shell-state');
  capture.actual = actual;
  return {
    ...actual,
    INITIAL_SHELL_STATE: capture.shellState,
    navigateHome: (state: unknown) => {
      capture.navigateHome(state);
      return (actual.navigateHome as (value: unknown) => unknown)(state);
    },
    revealChangesInPanel: (state: unknown) => {
      capture.revealChangesInPanel(state);
      return (actual.revealChangesInPanel as (value: unknown) => unknown)(
        state
      );
    },
    revealFileInPanel: (state: unknown, request: unknown) => {
      capture.revealFileInPanel(state, request);
      return (
        actual.revealFileInPanel as (value: unknown, r: unknown) => unknown
      )(state, request);
    }
  };
});

const harness = vi.hoisted(() => ({
  providers: [] as readonly Provider[],
  conversations: [] as readonly Conversation[],
  projects: [] as readonly Project[]
}));

vi.mock('@/features/providers/hooks/use-provider-catalog', () => ({
  useProviderCatalog: () => ({ providers: harness.providers, isLoading: false })
}));

vi.mock('@/features/providers/hooks/use-composer-selection', async () => {
  const { resolveSelection } = await import('@/shared/domain/selection-chain');
  return {
    useComposerSelection: (providers: readonly Provider[]) => ({
      resolved: resolveSelection(providers, null),
      selectProvider: () => undefined,
      selectModel: () => undefined,
      selectEffort: () => undefined
    })
  };
});

vi.mock('@/features/projects/hooks/use-project-catalog', () => ({
  useProjectCatalog: () => ({
    projects: harness.projects,
    activeProject: null,
    selectProject: () => undefined,
    changeApprovalMode: () => undefined,
    createProject: () => undefined
  })
}));

vi.mock('@/features/projects/hooks/use-workspace-branches', () => ({
  useWorkspaceBranches: () => []
}));

vi.mock('@/features/conversations/hooks/use-conversation-catalog', () => ({
  useConversationCatalog: () => ({
    conversations: harness.conversations,
    isLoading: false
  })
}));

import { AppShell } from './app-shell';

const catalog: readonly Provider[] = [
  {
    id: 'opencode',
    displayName: 'OpenCode',
    icon: 'opencode',
    subtitle: 'Open source',
    availableModels: [
      {
        id: 'glm-4.6',
        displayName: 'GLM 4.6',
        providerId: 'opencode',
        supportedEffortLevels: ['light']
      }
    ]
  }
];

const openConversation: Conversation = {
  id: 'conv-composer-chain',
  projectId: 'proj-design',
  title: 'Composer selection chain',
  messages: [],
  isPinned: true,
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-14T16:30:00.000Z'
};

const fileRequest: OpenFileRequest = {
  path: 'docs/research-tecnico/arquitectura-tauri.md'
};

type Transition = (state: unknown, request?: unknown) => unknown;

describe('shell navigation seam', () => {
  beforeEach(() => {
    capture.rail = null;
    capture.sidebar = null;
    capture.homeView = null;
    capture.conversationView = null;
    capture.filePanel = null;
    capture.navigateHome.mockReset();
    capture.revealFileInPanel.mockReset();
    capture.revealChangesInPanel.mockReset();
    capture.shellState.openChangesRequestCount = 0;
    layout.value = { sidebar: 'inline', rightPanel: 'inline' };

    capture.shellState.activeConversationId = 'conv-composer-chain';
    capture.shellState.visibility = { sidebar: true, rightPanel: false };
    capture.shellState.openFileRequest = null;

    harness.providers = catalog;
    harness.conversations = [openConversation];
    harness.projects = [];
  });

  it('wires both Home entry points to one shell transition that clears the conversation', () => {
    renderToStaticMarkup(<AppShell />);

    const railHome = capture.rail?.onNavigateHome as (() => void) | undefined;
    const sidebarHome = capture.sidebar?.onNewChat as (() => void) | undefined;

    expect(typeof railHome).toBe('function');
    expect(typeof sidebarHome).toBe('function');
    // One handler behind both affordances: a second one could drift.
    expect(railHome).toBe(sidebarHome);

    railHome?.();
    sidebarHome?.();

    // Both presses reached the transition, each with the shell's current state
    // (an open conversation), so both clear it.
    expect(capture.navigateHome).toHaveBeenCalledTimes(2);
    expect(capture.navigateHome).toHaveBeenCalledWith(capture.shellState);
    expect(capture.shellState.activeConversationId).toBe('conv-composer-chain');

    const cleared = (capture.actual.navigateHome as Transition)(
      capture.shellState
    ) as {
      activeConversationId: unknown;
    };
    expect(cleared.activeConversationId).toBeNull();
  });

  it('shows the conversation region for the open conversation and Home otherwise', () => {
    renderToStaticMarkup(<AppShell />);
    expect(capture.conversationView).not.toBeNull();
    expect(capture.homeView).toBeNull();
    expect(capture.conversationView?.conversation).toBe(openConversation);

    capture.conversationView = null;
    capture.shellState.activeConversationId = null;
    renderToStaticMarkup(<AppShell />);

    expect(capture.conversationView).toBeNull();
    expect(capture.homeView).not.toBeNull();
  });

  it('opens the right panel and shows the requested file when a chip emits a request', () => {
    renderToStaticMarkup(<AppShell />);

    const onRequestOpenFile = capture.conversationView?.onRequestOpenFile as
      ((request: OpenFileRequest) => void) | undefined;
    expect(typeof onRequestOpenFile).toBe('function');

    // The panel is mounted even while the region is closed, so its tab set is
    // never rebuilt from scratch on reopen (#40, criterion 5).
    expect(capture.filePanel).not.toBeNull();
    expect(capture.filePanel?.isOpen).toBe(false);

    onRequestOpenFile?.(fileRequest);

    expect(capture.revealFileInPanel).toHaveBeenCalledWith(
      capture.shellState,
      fileRequest
    );

    const revealed = (capture.actual.revealFileInPanel as Transition)(
      capture.shellState,
      fileRequest
    ) as {
      visibility: { sidebar: boolean; rightPanel: boolean };
      openFileRequest: unknown;
    };
    expect(revealed.visibility.rightPanel).toBe(true);
    expect(revealed.visibility.sidebar).toBe(true);
    expect(revealed.openFileRequest).toBe(fileRequest);
  });

  it('routes a diff request to the reveal transition and hands the counter to the panel', () => {
    capture.shellState.openChangesRequestCount = 3;
    renderToStaticMarkup(<AppShell />);
    expect(capture.filePanel?.openChangesRequestCount).toBe(3);
    const onRequestOpenChanges = capture.conversationView
      ?.onRequestOpenChanges as (() => void) | undefined;
    expect(typeof onRequestOpenChanges).toBe('function');
    onRequestOpenChanges?.();
    expect(capture.revealChangesInPanel).toHaveBeenCalledWith(
      capture.shellState
    );
    const revealed = (capture.actual.revealChangesInPanel as Transition)(
      capture.shellState
    ) as {
      openChangesRequestCount: number;
      visibility: { rightPanel: boolean };
    };
    expect(revealed.openChangesRequestCount).toBe(4);
    expect(revealed.visibility.rightPanel).toBe(true);
  });

  it('hands the composer one shell-owned draft, in whichever view is active', () => {
    renderToStaticMarkup(<AppShell />);

    const conversationComposer = capture.conversationView?.composer as
      ReactElement<Record<string, unknown>> | undefined;
    expect(conversationComposer).toBeDefined();
    // Identity, not deep equality: the shell passes its own state object, so a
    // second draft copy inside the composer would fail this assertion (#40,
    // criterion 2).
    expect(conversationComposer?.props.draft).toBe(EMPTY_COMPOSER_DRAFT);
    expect(typeof conversationComposer?.props.onDraftChange).toBe('function');
    // The composer is controlled: it is handed the value and a reporter, never
    // an initial value it could own and lose when re-slotted.
    expect(Object.keys(conversationComposer?.props ?? {})).not.toContain(
      'initialDraft'
    );

    // The same shell state is slotted into the home view when no conversation is
    // open: the draft belongs to the shell, so the Home <-> Conversation switch
    // cannot drop it.
    capture.shellState.activeConversationId = null;
    renderToStaticMarkup(<AppShell />);

    const homeComposer = capture.homeView?.composer as
      ReactElement<Record<string, unknown>> | undefined;
    expect(homeComposer).toBeDefined();
    expect(homeComposer?.props.draft).toBe(EMPTY_COMPOSER_DRAFT);
    expect(typeof homeComposer?.props.onDraftChange).toBe('function');
  });

  it('keeps the sidebar inline at wide widths and collapses it to an overlay drawer when narrow (#43)', () => {
    renderToStaticMarkup(<AppShell />);
    // Wide: the sidebar still owns its column, and it has no dismiss handler it
    // would not use.
    expect(capture.sidebar?.isOverlay).toBe(false);

    layout.value = { sidebar: 'overlay', rightPanel: 'overlay' };
    renderToStaticMarkup(<AppShell />);

    // Narrow: the sidebar hands its column to the rail and is drawn as an
    // on-demand drawer. Its visibility state — and therefore the rail toggle —
    // is untouched, and dismissing the drawer reports through the *same* shell
    // transition the rail toggle uses, so region visibility keeps one owner.
    expect(capture.sidebar?.isOverlay).toBe(true);
    expect(capture.sidebar?.onClose).toBe(capture.rail?.onToggleSidebar);
  });
});
