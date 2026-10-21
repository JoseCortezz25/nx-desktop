import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runMessages } from '@/features/runs/messages';
import type { LiveTurn } from '@/features/runs/model/live-run';
import type { Conversation } from '@/shared/domain/conversation.types';
import type { Provider } from '@/shared/domain/provider.types';
import type { ComposerSelection } from '@/shared/domain/selection-chain';
import type { ComposerProps } from '@/shared/ui/organisms/composer';
import type { ConversationViewProps } from '@/shared/ui/organisms/conversation-view';

/**
 * The live-run seam #23 adds, exercised through the shell's real wiring:
 * the composer's submit starts a run for the open conversation, the composer's
 * stop control cancels it, and the conversation view renders the live turn and
 * its status line. Static rendering runs no events, so the suite captures the
 * props the shell hands its children and drives the callbacks it wired.
 */
const capture = vi.hoisted(() => ({
  composer: null as ComposerProps | null,
  conversationView: null as ConversationViewProps | null,
  shellState: {
    activeConversationId: 'conv-1' as string | null,
    visibility: { sidebar: false, rightPanel: false },
    openFileRequest: null,
    openChangesRequestCount: 0,
    hookReview: { isOpen: false, selectedHookIds: new Set<string>() },
    openSubagentsRequestCount: 0,
    openSubagentsRequestSubagentId: null
  }
}));

const liveRun = vi.hoisted(() => ({
  turns: [] as LiveTurn[],
  isRunning: false,
  startRun: vi.fn(() => true),
  cancelRun: vi.fn()
}));

const harness = vi.hoisted(() => ({
  providers: [] as readonly Provider[],
  conversations: [] as readonly Conversation[],
  desired: null as ComposerSelection | null
}));

vi.mock('@/shared/ui/organisms/composer', () => ({
  Composer: (props: ComposerProps) => {
    capture.composer = props;
    return null;
  }
}));
vi.mock('@/shared/ui/organisms/conversation-view', () => ({
  ConversationView: (props: ConversationViewProps) => {
    capture.conversationView = props;
    return props.composer as ReactElement;
  }
}));
vi.mock('@/shared/ui/organisms/rail', () => ({ Rail: () => null }));
vi.mock('@/shared/ui/organisms/sidebar', () => ({ Sidebar: () => null }));
vi.mock('@/features/files/ui/organisms/file-panel', () => ({
  FilePanel: () => null
}));
vi.mock('./shell-state', async () => {
  const actual =
    await vi.importActual<Record<string, unknown>>('./shell-state');
  return { ...actual, INITIAL_SHELL_STATE: capture.shellState };
});
vi.mock('@/features/runs/hooks/use-live-run', () => ({
  useLiveRun: () => liveRun
}));
vi.mock('@/features/hooks/hooks/use-hook-review', () => ({
  useHookReview: () => ({ hooks: [], isLoading: false })
}));
vi.mock('@/features/providers/hooks/use-provider-catalog', () => ({
  useProviderCatalog: () => ({ providers: harness.providers, isLoading: false })
}));
vi.mock('@/features/providers/hooks/use-composer-selection', async () => {
  const { resolveSelection } = await import('@/shared/domain/selection-chain');
  return {
    useComposerSelection: (providers: readonly Provider[]) => ({
      resolved: resolveSelection(providers, harness.desired),
      selectProvider: () => undefined,
      selectModel: () => undefined,
      selectEffort: () => undefined
    })
  };
});
vi.mock('@/features/projects/hooks/use-project-catalog', () => ({
  useProjectCatalog: () => ({
    projects: [],
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

const conversation: Conversation = {
  id: 'conv-1',
  projectId: 'proj-1',
  title: 'Selection chain',
  messages: [],
  isPinned: false,
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-01T09:00:00.000Z'
};

const environment = {
  useNewWorktree: false,
  gitBranch: 'main',
  environmentName: ''
};

function streamingTurn(overrides: Partial<LiveTurn> = {}): LiveTurn {
  return {
    id: 'live-turn-1',
    conversationId: 'conv-1',
    prompt: 'Explain it',
    startedAt: '2026-10-20T10:00:00.000Z',
    runId: 'run-1',
    lastSeq: 2,
    status: 'streaming',
    text: 'Partial reply',
    toolCalls: [],
    error: null,
    ...overrides
  };
}

beforeEach(() => {
  capture.composer = null;
  capture.conversationView = null;
  capture.shellState.activeConversationId = 'conv-1';
  harness.providers = catalog;
  harness.conversations = [conversation];
  harness.desired = {
    providerId: 'opencode',
    modelId: 'glm-4.6',
    effortLevel: 'light'
  };
  liveRun.turns = [];
  liveRun.isRunning = false;
  liveRun.startRun.mockClear();
  liveRun.cancelRun.mockClear();
});

describe('shell live-run seam', () => {
  it('starts a run for the open conversation with the resolved selection', () => {
    renderToStaticMarkup(<AppShell />);
    capture.composer?.onSubmit('Explain it', environment);

    expect(liveRun.startRun).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      projectId: 'proj-1',
      providerId: 'opencode',
      modelId: 'glm-4.6',
      effortLevel: 'light',
      prompt: 'Explain it',
      environment
    });
  });

  it('starts nothing while no provider is selected', () => {
    // No provider is preselected (decision 2026-10-20): with a loaded catalog
    // but no explicit choice the chain is unresolved, and the shell must not
    // fall back to the catalog's first provider to start a run.
    harness.desired = null;
    renderToStaticMarkup(<AppShell />);

    expect(capture.composer?.selection).toBeNull();
    capture.composer?.onSubmit('Explain it', environment);
    expect(liveRun.startRun).not.toHaveBeenCalled();
  });

  it('starts nothing once the selected provider leaves the catalog', () => {
    harness.desired = {
      providerId: 'gone',
      modelId: 'gone-model',
      effortLevel: 'light'
    };
    renderToStaticMarkup(<AppShell />);

    expect(capture.composer?.selection).toBeNull();
    capture.composer?.onSubmit('Explain it', environment);
    expect(liveRun.startRun).not.toHaveBeenCalled();
  });

  it('starts nothing from Home, where no conversation is open', () => {
    capture.shellState.activeConversationId = null;
    renderToStaticMarkup(<AppShell />);
    capture.composer?.onSubmit('Explain it', environment);
    expect(liveRun.startRun).not.toHaveBeenCalled();
  });

  it('hands the composer the running flag and the cancel intent', () => {
    liveRun.isRunning = true;
    renderToStaticMarkup(<AppShell />);
    expect(capture.composer?.isRunActive).toBe(true);
    capture.composer?.onCancelRun?.();
    expect(liveRun.cancelRun).toHaveBeenCalledTimes(1);
  });

  it('renders the streaming turn after the persisted messages with its status', () => {
    liveRun.turns = [streamingTurn()];
    liveRun.isRunning = true;
    renderToStaticMarkup(<AppShell />);

    const view = capture.conversationView;
    expect(view?.conversation.messages.map(message => message.content)).toEqual(
      ['Explain it', 'Partial reply']
    );
    expect(view?.runStatusLabel).toBe(runMessages.status.streaming);
  });

  it('reflects the cancelled terminal state in the status line', () => {
    liveRun.turns = [streamingTurn({ status: 'cancelled' })];
    renderToStaticMarkup(<AppShell />);
    expect(capture.conversationView?.runStatusLabel).toBe(
      runMessages.status.cancelled
    );
  });
});
