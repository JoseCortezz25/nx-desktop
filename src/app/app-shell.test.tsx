import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Conversation } from '@/shared/domain/conversation.types';
import { getSharedMessages } from '@/shared/i18n/messages';
import type { Project } from '@/shared/domain/project.types';
import type { Provider } from '@/shared/domain/provider.types';
import {
  changeProvider,
  type ComposerSelection
} from '@/shared/domain/selection-chain';

/**
 * The shell resolves its catalogs through feature hooks that fetch asynchronously
 * (no-op under static rendering). This suite replaces those hooks with a
 * controllable harness so the shell's *wiring* can be asserted: the sidebar
 * brand is static, and the composer receives the reconciled selection chain.
 *
 * The selection-chain mock re-derives with the real `resolveSelection`. #41
 * supersedes #10's provider brand, but the original regression concern remains
 * and is now stronger: changing the reconciled provider must not make a catalog
 * row (or the active provider) appear in the brand.
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

  it('shows the application brand, not the catalog default', () => {
    // #41 supersedes #10: the header no longer follows any provider. The
    // regression concern #10 guarded — never read `providers[0]` — remains, and
    // is now stronger because no catalog row may appear in the brand at all.
    const markup = renderSidebarShell();

    expect(markup).toContain('<span class="sidebar__brand-name">Nx</span>');
    expect(markup).not.toContain(
      '<span class="sidebar__brand-name">OpenCode</span>'
    );
  });

  it('keeps the application brand when a second provider is selected', () => {
    // The catalog's first row is still OpenCode; only the reconciled chain says
    // Codex. The brand must still read Nx, proving it reads neither the catalog
    // default nor the active provider.
    harness.desired = changeProvider(catalog, 'codex');
    expect(catalog[0]?.displayName).toBe('OpenCode');

    const markup = renderSidebarShell();

    expect(markup).toContain('<span class="sidebar__brand-name">Nx</span>');
    expect(markup).not.toContain(
      '<span class="sidebar__brand-name">Codex</span>'
    );
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

describe('app shell native window chrome (#42)', () => {
  beforeEach(() => {
    harness.providers = catalog;
    harness.conversations = [];
    harness.projects = [];
    harness.desired = null;
  });

  it('renders no drawn title bar, menu bar, history or window controls', () => {
    const markup = renderSidebarShell();

    // #42: the window frame, its minimize/maximize/close controls and the
    // application menu are the operating system's. The frontend draws none of
    // them, so neither the classes nor the copy they rendered may come back.
    // The copy is matched as a button text node (`>label<`): "Archivos
    // abiertos" (the file tab list) legitimately contains "Archivo".
    expect(markup).not.toContain('class="title-bar"');
    expect(markup).not.toContain('class="menu-bar"');
    expect(markup).not.toContain('class="window-controls"');
    expect(markup).not.toContain('class="nav-history"');
    expect(markup).not.toContain('>Archivo<');
    expect(markup).not.toContain('>Edición<');
    expect(markup).not.toContain('>Ver<');
    expect(markup).not.toContain('>Ayuda<');
    expect(markup).not.toContain('>Minimizar<');
    expect(markup).not.toContain('>Maximizar<');
    expect(markup).not.toContain('>Atrás<');
    expect(markup).not.toContain('>Adelante<');
  });

  it('keeps the two region toggles by moving them into the rail', () => {
    const markup = renderSidebarShell();
    const messages = getSharedMessages();

    expect(markup).toContain('class="rail"');
    expect(markup).toContain(
      `aria-label="${messages.rail.toggleSidebarLabel}"`
    );
    expect(markup).toContain(
      `aria-label="${messages.rail.toggleRightPanelLabel}"`
    );
  });
});
