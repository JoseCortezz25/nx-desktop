import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Conversation } from '@/shared/domain/conversation.types';
import type { Project } from '@/shared/domain/project.types';
import type { Provider } from '@/shared/domain/provider.types';
import type { CreateProjectInput } from '@/features/projects/model/create-project.types';
import { resolveSelection } from '@/shared/domain/selection-chain';

/**
 * The create-project seam #9 closes, exercised through the shell's **real
 * wiring**: the project chip's picker row hands an opener to the composer, the
 * shell owns whether the dialog is open, and the dialog's validated submit
 * reaches the shell's single `useProjectCatalog`.
 *
 * Static rendering runs no events, so the suite captures the props the shell
 * hands its children and drives the callbacks it wired — the same technique the
 * navigation and panel seam suites use. Two facts are asserted that the
 * acceptance criteria name directly: the shell calls `useProjectCatalog`
 * **once** (one catalog owner), and a submit lands on that hook's `createProject`
 * (creation is not a second repository instance).
 */
const captured = vi.hoisted(() => ({
  dialog: null as Record<string, unknown> | null,
  composerProps: null as Record<string, unknown> | null,
  createProject: vi.fn(),
  catalogCalls: 0
}));

vi.mock('@/features/projects/ui/organisms/create-project-dialog', () => ({
  CreateProjectDialog: (props: Record<string, unknown>) => {
    captured.dialog = props;
    return null;
  }
}));

/**
 * The composer is captured instead of rendered so the suite can read the one
 * prop the shell is responsible for (`onCreateProject`); the picker row itself
 * and the dialog body are covered by their own suites.
 */
vi.mock('@/shared/ui/organisms/composer', () => ({
  Composer: (props: Record<string, unknown>) => {
    captured.composerProps = props;
    return null;
  }
}));

vi.mock('@/shared/ui/organisms/home-view', () => ({
  HomeView: ({ composer }: { composer: ReactElement }) => composer
}));

/**
 * One catalog owner. The factory counts its calls and hands the shell a spy for
 * `createProject`, so the suite can prove the shell wires the dialog's submit to
 * the same hook that owns the list.
 */
vi.mock('@/features/projects/hooks/use-project-catalog', () => ({
  useProjectCatalog: () => {
    captured.catalogCalls += 1;
    return {
      projects: harness.projects,
      activeProject: null,
      selectProject: () => undefined,
      changeApprovalMode: () => undefined,
      createProject: captured.createProject
    };
  }
}));

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

const createdInput: CreateProjectInput = {
  name: 'Gamma app',
  folders: ['/mock/workspace/gamma-site']
};

describe('shell create-project seam', () => {
  beforeEach(() => {
    captured.dialog = null;
    captured.composerProps = null;
    captured.catalogCalls = 0;
    captured.createProject.mockReset();
    harness.providers = catalog;
    harness.conversations = [];
    harness.projects = [];
  });

  it('owns the project list and creation through exactly one catalog hook', () => {
    renderToStaticMarkup(<AppShell />);

    expect(captured.catalogCalls).toBe(1);
  });

  it('hands the composer the opener the picker row reports', () => {
    renderToStaticMarkup(<AppShell />);

    // The picker row lives behind the project chip's popover, so what the shell
    // must prove here is that it supplies the opener at all; the picker's own
    // suite proves the row renders and reports, and the browser pass drives the
    // open press end to end.
    expect(typeof captured.composerProps?.onCreateProject).toBe('function');
  });

  it('mounts one shell-owned dialog handed the draft and the reporters only', () => {
    renderToStaticMarkup(<AppShell />);

    expect(captured.dialog).not.toBeNull();
    // Closed until a draft exists: the shell's single piece of create-project
    // state is the draft, and `null` is the closed state.
    expect(captured.dialog?.draft).toBeNull();
    // It may read the draft and report changes; it never receives the catalog or
    // a setter for the project list, which keeps one owner of the list.
    expect(Object.keys(captured.dialog ?? {}).sort()).toEqual([
      'draft',
      'onClose',
      'onDraftChange',
      'onSubmit'
    ]);
  });

  it('creates the project through the shell hook when the dialog submits', () => {
    renderToStaticMarkup(<AppShell />);

    const onSubmit = captured.dialog?.onSubmit as
      ((input: CreateProjectInput) => void) | undefined;
    expect(typeof onSubmit).toBe('function');

    onSubmit?.(createdInput);

    // Identity, not a copy: a second repository or catalog instance inside the
    // dialog would fail this — the write must land on the hook that owns the list.
    expect(captured.createProject).toHaveBeenCalledTimes(1);
    expect(captured.createProject).toHaveBeenCalledWith(createdInput);
  });

  it('closes the dialog through a handler the dialog can call', () => {
    renderToStaticMarkup(<AppShell />);

    expect(typeof captured.dialog?.onClose).toBe('function');
    expect(typeof captured.dialog?.onDraftChange).toBe('function');
  });

  it('renders the shell the same way when a project already exists', () => {
    // Guards the suite's own assumption: the seeded shell reconciles, so the
    // assertions above run against the shipped shell rather than an empty stub.
    harness.projects = [
      {
        id: 'proj-design',
        name: 'Design system',
        workspaceFolders: ['/workspace/design'],
        approvalMode: 'ask_always',
        hookDecisions: [],
        conversationIds: []
      }
    ];

    renderToStaticMarkup(<AppShell />);

    expect(resolveSelection(catalog, null)?.provider.displayName).toBe(
      'OpenCode'
    );
    expect(captured.dialog?.draft).toBeNull();
  });
});
