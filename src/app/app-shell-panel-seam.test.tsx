import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Conversation } from '@/shared/domain/conversation.types';
import type { Project } from '@/shared/domain/project.types';
import type { Provider } from '@/shared/domain/provider.types';
import { resolveSelection } from '@/shared/domain/selection-chain';

/**
 * The seam #11 built and #12 consumes: the shell owns **one** open-file request,
 * and the right panel reads that same value. This suite renders the shell's real
 * state and asserts the panel is handed it — deliberately not a request built by
 * the test, which would only prove the panel component.
 *
 * The shell's state starts empty and a file chip is the only thing that sets it.
 * Static rendering runs no events and no effects, so the request is seeded the way
 * `INITIAL_REGION_VISIBILITY` is already seeded in `app-shell.test.tsx`: through
 * the shell's own initial state, not through a copy.
 */
const openedFile = vi.hoisted(() => ({
  path: 'docs/research-tecnico/arquitectura-tauri.md'
}));

const captured = vi.hoisted(() => ({
  panel: null as Record<string, unknown> | null
}));

/**
 * The window width the shell resolves its region presentation from. The suite
 * seeds the *policy result* rather than a pixel width, so the wiring assertion
 * is deterministic in the node runner; the policy itself is covered by
 * `region-visibility.test.ts` and the geometry by the browser pass.
 */
const layout = vi.hoisted(() => ({
  value: { sidebar: 'inline', rightPanel: 'inline' } as {
    sidebar: 'inline' | 'overlay';
    rightPanel: 'inline' | 'overlay';
  }
}));

vi.mock('@/features/files/model/open-file-request', () => ({
  INITIAL_OPEN_FILE_REQUEST: openedFile
}));

vi.mock('@/features/files/ui/organisms/file-panel', () => ({
  FilePanel: (props: Record<string, unknown>) => {
    captured.panel = props;
    return null;
  }
}));

/** Screen 23 draws the panel next to the conversation, so open the region. */
vi.mock('@/shared/ui/layout/region-visibility', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '@/shared/ui/layout/region-visibility'
  );
  return {
    ...actual,
    INITIAL_REGION_VISIBILITY: { sidebar: false, rightPanel: true },
    resolveRegionLayout: () => layout.value
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
  const { resolveSelection: resolve } =
    await import('@/shared/domain/selection-chain');
  return {
    useComposerSelection: (providers: readonly Provider[]) => ({
      resolved: resolve(providers, null),
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

import { INITIAL_OPEN_FILE_REQUEST } from '@/features/files/model/open-file-request';
import { AppShell } from './app-shell';
import { INITIAL_SHELL_STATE } from './shell-state';

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

describe('shell to right panel open-file seam', () => {
  beforeEach(() => {
    captured.panel = null;
    layout.value = { sidebar: 'inline', rightPanel: 'inline' };
    harness.providers = catalog;
    harness.conversations = [];
    harness.projects = [];
  });

  it('hands the panel the same open-file request the shell owns', () => {
    renderToStaticMarkup(<AppShell />);

    expect(captured.panel).not.toBeNull();
    // Identity, not deep equality: the panel must read the shell's state value, so
    // a second copy of the request would fail this assertion.
    expect(captured.panel?.openFileRequest).toBe(INITIAL_OPEN_FILE_REQUEST);
    expect(captured.panel?.openFileRequest).toEqual(openedFile);
    expect(captured.panel?.openChangesRequestCount).toBe(
      INITIAL_SHELL_STATE.openChangesRequestCount
    );
  });

  it('hands the panel the shell-owned initial subagents request', () => {
    renderToStaticMarkup(<AppShell />);
    expect(captured.panel?.openSubagentsRequestCount).toBe(0);
    expect(captured.panel?.openSubagentsRequestSubagentId).toBeNull();
  });

  it('gives the panel no way to own or emit the request', () => {
    renderToStaticMarkup(<AppShell />);

    // The panel may read the request and close the region; nothing else. If it
    // also received a setter it could drift into a second owner.
    expect(Object.keys(captured.panel ?? {}).sort()).toEqual([
      'isOpen',
      'isOverlay',
      'onClose',
      'openChangesRequestCount',
      'openFileRequest',
      'openSubagentsRequestCount',
      'openSubagentsRequestSubagentId',
      'projectId'
    ]);
  });

  it('scopes the panel reads to the active project, none in this suite', () => {
    renderToStaticMarkup(<AppShell />);
    expect(captured.panel?.projectId).toBeNull();
  });

  it('hands the panel the region visibility the shell owns', () => {
    renderToStaticMarkup(<AppShell />);

    // This suite seeds the right panel open, so the panel must be told so; the
    // shell owns visibility and the panel only reflects it (#40, criterion 4/5).
    expect(captured.panel?.isOpen).toBe(true);
  });

  it('resolves the shell selection chain the same way the composer does', () => {
    // Guards the assumptions of this suite: the seeded catalog reconciles, so the
    // rendered shell is the shell the app ships, not an empty stub.
    expect(resolveSelection(catalog, null)?.provider.displayName).toBe(
      'OpenCode'
    );
  });

  it('keeps the panel inline at wide widths (#43)', () => {
    layout.value = { sidebar: 'inline', rightPanel: 'inline' };
    renderToStaticMarkup(<AppShell />);

    expect(captured.panel?.isOverlay).toBe(false);
  });

  it('hands the panel the overlay presentation below the panel breakpoint (#43)', () => {
    // At 900x700 the shell must not lay the panel out as a fixed column beside
    // the main pane; it tells the panel to draw as an on-demand overlay. The
    // region's visibility is untouched, so the rail toggle keeps working.
    layout.value = { sidebar: 'overlay', rightPanel: 'overlay' };
    renderToStaticMarkup(<AppShell />);

    expect(captured.panel?.isOverlay).toBe(true);
    expect(captured.panel?.isOpen).toBe(true);
  });
});
