import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Conversation } from '@/shared/domain/conversation.types';
import type { Project } from '@/shared/domain/project.types';
import type { Provider } from '@/shared/domain/provider.types';
import {
  changeProvider,
  type ComposerSelection
} from '@/shared/domain/selection-chain';

/**
 * The shell resolves its catalogs through feature hooks that fetch asynchronously
 * (no-op under static rendering). This suite replaces those hooks with a
 * controllable harness so the shell's *wiring* can be asserted: which value it
 * hands the sidebar brand, and which selection it hands the composer.
 *
 * The selection-chain mock re-derives with the real `resolveSelection`, so the
 * brand is proven to follow the reconciled chain rather than the catalog's first
 * row — the defect this ticket was handed.
 */
const harness = vi.hoisted(() => ({
  providers: [] as readonly Provider[],
  conversations: [] as readonly Conversation[],
  projects: [] as readonly Project[],
  desired: null as ComposerSelection | null
}));

vi.mock('@/features/providers/hooks/use-provider-catalog', () => ({
  useProviderCatalog: () => ({
    providers: harness.providers,
    isLoading: false
  })
}));

/**
 * Screen 01 starts with the sidebar closed; the brand is only mounted when it is
 * open. Region visibility is orthogonal to the brand wiring, so this suite opens
 * the sidebar without touching the toggle transition.
 */
vi.mock('@/shared/ui/layout/region-visibility', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '@/shared/ui/layout/region-visibility'
  );
  return {
    ...actual,
    INITIAL_REGION_VISIBILITY: { sidebar: true, rightPanel: false }
  };
});

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
    projects: harness.projects,
    activeProject: null,
    selectProject: () => undefined,
    changeApprovalMode: () => undefined
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
  },
  {
    id: 'codex',
    displayName: 'Codex',
    icon: 'codex',
    subtitle: 'OpenAI',
    availableModels: [
      {
        id: 'gpt-5-codex',
        displayName: 'GPT-5 Codex',
        providerId: 'codex',
        supportedEffortLevels: ['maximum']
      }
    ]
  }
];

const projects: readonly Project[] = [
  {
    id: 'proj-design',
    name: 'Design system',
    workspaceFolders: ['/workspace/design'],
    approvalMode: 'ask_always',
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
  }
];

function renderSidebarShell() {
  return renderToStaticMarkup(<AppShell />);
}

describe('app shell sidebar brand', () => {
  beforeEach(() => {
    harness.providers = catalog;
    harness.conversations = [];
    harness.projects = [];
    harness.desired = null;
  });

  it('shows the catalog default while no provider is chosen', () => {
    expect(renderSidebarShell()).toContain(
      '<span class="sidebar__brand-name">OpenCode</span>'
    );
  });

  it('follows the active provider once a second provider is selected', () => {
    // The catalog's first row is still OpenCode; only the reconciled chain says
    // Codex. A brand that read `providers[0]` would fail this assertion.
    harness.desired = changeProvider(catalog, 'codex');
    expect(catalog[0]?.displayName).toBe('OpenCode');

    const markup = renderSidebarShell();

    expect(markup).toContain('<span class="sidebar__brand-name">Codex</span>');
    expect(markup).not.toContain(
      '<span class="sidebar__brand-name">OpenCode</span>'
    );
  });

  it('hands the same reconciled chain to the composer selectors', () => {
    harness.desired = changeProvider(catalog, 'codex');

    const markup = renderSidebarShell();

    expect(markup).toContain('aria-label="Proveedor: Codex"');
    expect(markup).toContain('placeholder="Trabaja con Codex"');
  });

  it('renders the sidebar groups from the conversation and project ports', () => {
    harness.conversations = conversations;
    harness.projects = projects;

    const markup = renderSidebarShell();

    expect(markup).toContain('Fijados');
    expect(markup).toContain('Proyectos');
    expect(markup).toContain('Recientes');
    expect(markup).toContain('Composer selection chain');
    expect(markup).toContain('Diff review panel');
  });
});
