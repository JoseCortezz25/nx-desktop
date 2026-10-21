import type * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Hook } from '@/shared/domain/hook.types';
import type { Project } from '@/shared/domain/project.types';
import type { ComposerProps } from '@/shared/ui/organisms/composer';
import type { HookReviewDialogProps } from '@/features/hooks/ui/organisms/hook-review-dialog';
import type { ShellState } from './shell-state';

const harness = vi.hoisted(() => ({
  shell: null as ShellState | null,
  composer: null as ComposerProps | null,
  dialog: null as HookReviewDialogProps | null,
  hooks: null as readonly Hook[] | null,
  projects: [] as readonly Project[],
  hookProjectIds: [] as (string | null)[],
  decideHooks: vi.fn(),
  isDecisionStored: true,
  selectProject: vi.fn(),
  changeApprovalMode: vi.fn(),
  createProject: vi.fn()
}));

// Retain only the shell's state slot between static renders; other hooks remain real.
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof React>('react');
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (
        typeof initial === 'object' &&
        initial !== null &&
        'hookReview' in initial
      ) {
        const current = harness.shell ?? (initial as ShellState);
        return [
          current,
          (next: ShellState | ((state: ShellState) => ShellState)) => {
            harness.shell =
              typeof next === 'function'
                ? next(harness.shell ?? current)
                : next;
          }
        ];
      }
      return actual.useState(initial);
    }
  };
});
vi.mock('@/shared/ui/organisms/composer', () => ({
  Composer: (props: ComposerProps) => {
    harness.composer = props;
    return null;
  }
}));
vi.mock('@/features/hooks/ui/organisms/hook-review-dialog', () => ({
  HookReviewDialog: (props: HookReviewDialogProps) => {
    harness.dialog = props;
    return null;
  }
}));
vi.mock('@/features/hooks/hooks/use-hook-review', () => ({
  useHookReview: (projectId: string | null) => {
    harness.hookProjectIds.push(projectId);
    return {
      hooks: harness.hooks,
      isLoading: harness.hooks === null,
      loadError: null,
      isDeciding: false,
      decisionError: null,
      decideHooks: harness.decideHooks
    };
  }
}));
vi.mock('@/features/providers/hooks/use-provider-catalog', () => ({
  useProviderCatalog: () => ({ providers: [], isLoading: false })
}));
vi.mock('@/features/projects/hooks/use-project-catalog', () => ({
  useProjectCatalog: () => ({
    projects: harness.projects,
    activeProject: harness.projects[0],
    selectProject: harness.selectProject,
    changeApprovalMode: harness.changeApprovalMode,
    createProject: harness.createProject
  })
}));
vi.mock('@/features/projects/hooks/use-workspace-branches', () => ({
  useWorkspaceBranches: () => []
}));
vi.mock('@/features/conversations/hooks/use-conversation-catalog', () => ({
  useConversationCatalog: () => ({ conversations: [], isLoading: false })
}));
vi.mock('@/features/files/ui/organisms/file-panel', () => ({
  FilePanel: () => null
}));
vi.mock('@/features/projects/ui/organisms/create-project-dialog', () => ({
  CreateProjectDialog: () => null
}));

import { AppShell } from './app-shell';
const hooks: readonly Hook[] = [true, false, true].map((isNew, index) => ({
  id: `hook-${index}`,
  name: `Check ${index}`,
  isNew,
  origin: 'Project',
  hookType: 'PreToolUse',
  command: 'pnpm lint',
  timeoutMs: 5000,
  approvalStatus: 'pending'
}));
function render() {
  harness.dialog = null;
  renderToStaticMarkup(<AppShell />);
}
function composer(): ComposerProps {
  if (!harness.composer) throw new Error('Composer was not mounted');
  return harness.composer;
}
function dialog(): HookReviewDialogProps {
  if (!harness.dialog) throw new Error('Hook dialog was not mounted');
  return harness.dialog;
}

describe('shell hooks review seam', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.shell = null;
    harness.composer = null;
    harness.dialog = null;
    harness.hooks = hooks;
    harness.hookProjectIds = [];
    harness.isDecisionStored = true;
    harness.decideHooks.mockImplementation(() =>
      Promise.resolve(harness.isDecisionStored)
    );
    harness.projects = [
      {
        id: 'project-one',
        name: 'Workspace',
        workspaceFolders: ['/workspace'],
        approvalMode: 'ask_always',
        hookDecisions: [],
        conversationIds: []
      }
    ];
  });
  it('derives the composer count from the hook port and opens a fresh review', () => {
    render();
    expect(composer().newHookCount).toBe(2);
    expect(harness.dialog).toBeNull();
    expect(composer().onOpenHookReview).toBeTypeOf('function');
    composer().onOpenHookReview?.();
    render();
    expect(dialog().hooks).toBe(hooks);
    expect(dialog().selectedHookIds.size).toBe(0);
  });
  it('renders a zero count while loading', () => {
    harness.hooks = null;
    render();
    expect(composer().newHookCount).toBe(0);
  });
  it('owns selection and dismissal, and resets selection on reopen', () => {
    render();
    composer().onOpenHookReview?.();
    render();
    dialog().onToggleSelection('hook-0');
    render();
    expect([...dialog().selectedHookIds]).toEqual(['hook-0']);
    dialog().onToggleSelection('hook-1');
    render();
    expect([...dialog().selectedHookIds]).toEqual(['hook-0', 'hook-1']);
    dialog().onClose();
    render();
    expect(harness.dialog).toBeNull();
    composer().onOpenHookReview?.();
    render();
    expect(dialog().selectedHookIds.size).toBe(0);
  });
  it('reads the hooks of the active project', () => {
    render();
    expect(harness.hookProjectIds[harness.hookProjectIds.length - 1]).toBe(
      'project-one'
    );
  });
  it.each(['approved', 'rejected'] as const)(
    'records %s for every reviewed hook and closes once stored',
    async status => {
      render();
      composer().onOpenHookReview?.();
      render();
      dialog().onDecide(status, 'all');
      expect(harness.decideHooks).toHaveBeenCalledWith(
        ['hook-0', 'hook-1', 'hook-2'],
        status
      );
      await Promise.resolve();
      await Promise.resolve();
      render();
      expect(harness.dialog).toBeNull();
      expect(harness.changeApprovalMode).not.toHaveBeenCalled();
    }
  );
  it('records only the selection for the selection scope', () => {
    render();
    composer().onOpenHookReview?.();
    render();
    dialog().onToggleSelection('hook-2');
    render();
    dialog().onDecide('approved', 'selection');
    expect(harness.decideHooks).toHaveBeenCalledWith(['hook-2'], 'approved');
  });
  it('keeps the review open when the core did not store the decision', async () => {
    harness.isDecisionStored = false;
    render();
    composer().onOpenHookReview?.();
    render();
    dialog().onDecide('approved', 'all');
    await Promise.resolve();
    await Promise.resolve();
    render();
    expect(harness.dialog).not.toBeNull();
  });
});
