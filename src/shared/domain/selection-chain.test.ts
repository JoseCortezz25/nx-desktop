import { describe, expect, it } from 'vitest';
import {
  changeEnvironmentName,
  changeGitBranch,
  changeProvider,
  changeWorktreeFlag,
  reconcileSelection,
  resolveApprovalMode,
  resolveProject,
  resolveRunEnvironment,
  resolveSelection,
  type ComposerSelection
} from './selection-chain';
import type { Project } from './project.types';
import type { Provider } from './provider.types';

/**
 * A minimal, self-contained catalog: two providers whose model sets and effort
 * stops differ, which is exactly what the invariant must survive.
 */
const catalog: readonly Provider[] = [
  {
    id: 'alpha',
    displayName: 'Alpha',
    icon: 'alpha',
    subtitle: 'First provider',
    availableModels: [
      {
        id: 'alpha-one',
        displayName: 'Alpha One',
        providerId: 'alpha',
        supportedEffortLevels: ['light', 'standard']
      },
      {
        id: 'alpha-two',
        displayName: 'Alpha Two',
        providerId: 'alpha',
        supportedEffortLevels: ['standard', 'high', 'extended']
      }
    ]
  },
  {
    id: 'beta',
    displayName: 'Beta',
    icon: 'beta',
    subtitle: 'Second provider',
    availableModels: [
      {
        id: 'beta-one',
        displayName: 'Beta One',
        providerId: 'beta',
        supportedEffortLevels: ['maximum']
      }
    ]
  }
];

describe('changeProvider', () => {
  it('resets the chain to the new provider default model and effort', () => {
    expect(changeProvider(catalog, 'beta')).toEqual({
      providerId: 'beta',
      modelId: 'beta-one',
      effortLevel: 'maximum'
    });
  });

  it('never leaves a model that belongs to the previous provider', () => {
    const previous = changeProvider(catalog, 'alpha');
    expect(previous?.modelId).toBe('alpha-one');

    const next = changeProvider(catalog, 'beta');
    expect(next?.modelId).not.toBe(previous?.modelId);
    const beta = catalog.find(provider => provider.id === 'beta');
    expect(
      beta?.availableModels.some(model => model.id === next?.modelId)
    ).toBe(true);
  });

  it('returns null for a provider that is not in the catalog', () => {
    expect(changeProvider(catalog, 'missing')).toBeNull();
  });
});

describe('reconcileSelection', () => {
  it('keeps a selection whose model and effort are both valid', () => {
    const desired: ComposerSelection = {
      providerId: 'alpha',
      modelId: 'alpha-two',
      effortLevel: 'extended'
    };
    expect(reconcileSelection(catalog, desired)).toEqual(desired);
  });

  it('resets a model that does not belong to the requested provider', () => {
    const desired: ComposerSelection = {
      providerId: 'beta',
      modelId: 'alpha-one',
      effortLevel: 'light'
    };
    expect(reconcileSelection(catalog, desired)).toEqual({
      providerId: 'beta',
      modelId: 'beta-one',
      effortLevel: 'maximum'
    });
  });

  it('reconciles an effort stop the chosen model does not support', () => {
    const desired: ComposerSelection = {
      providerId: 'alpha',
      modelId: 'alpha-two',
      effortLevel: 'light'
    };
    const reconciled = reconcileSelection(catalog, desired);
    expect(reconciled?.modelId).toBe('alpha-two');
    expect(reconciled?.effortLevel).toBe('standard');
  });

  it('returns null for a provider that is not in the catalog', () => {
    const desired: ComposerSelection = {
      providerId: 'missing',
      modelId: 'alpha-one',
      effortLevel: 'light'
    };
    expect(reconcileSelection(catalog, desired)).toBeNull();
  });
});

describe('resolveSelection', () => {
  it('starts from the catalog default when nothing is chosen yet', () => {
    const resolved = resolveSelection(catalog, null);

    expect(resolved?.selection).toEqual({
      providerId: 'alpha',
      modelId: 'alpha-one',
      effortLevel: 'light'
    });
    expect(resolved?.provider.id).toBe('alpha');
    expect(resolved?.model.id).toBe('alpha-one');
  });

  it('reports the stops of the selected model, not a shared set', () => {
    const resolved = resolveSelection(catalog, {
      providerId: 'alpha',
      modelId: 'alpha-two',
      effortLevel: 'standard'
    });

    expect(resolved?.effortLevels).toEqual(['standard', 'high', 'extended']);
    expect(resolved?.effortLevels).toEqual(
      catalog[0]?.availableModels[1]?.supportedEffortLevels
    );
  });

  it('falls back to the catalog default when the chosen provider is gone', () => {
    const resolved = resolveSelection(catalog, {
      providerId: 'missing',
      modelId: 'alpha-one',
      effortLevel: 'light'
    });

    expect(resolved?.selection.providerId).toBe('alpha');
  });

  it('returns null while the catalog is empty', () => {
    expect(resolveSelection([], null)).toBeNull();
  });
});

/**
 * The project context the composer resolves alongside the selection chain: the
 * active project, the approval policy it carries, and the run environment.
 */
const projects: readonly Project[] = [
  {
    id: 'proj-one',
    name: 'One',
    workspaceFolders: ['/workspace/one'],
    approvalMode: 'ask_always',
    hookDecisions: [],
    conversationIds: []
  },
  {
    id: 'proj-two',
    name: 'Two',
    workspaceFolders: ['/workspace/two'],
    approvalMode: 'full_access',
    hookDecisions: [],
    conversationIds: []
  }
];

describe('resolveProject', () => {
  it('starts from the first project when nothing is chosen yet', () => {
    expect(resolveProject(projects, null)?.id).toBe('proj-one');
  });

  it('keeps the chosen project while it still exists', () => {
    expect(resolveProject(projects, 'proj-two')?.id).toBe('proj-two');
  });

  it('falls back to the first project when the chosen one is gone', () => {
    expect(resolveProject(projects, 'missing')?.id).toBe('proj-one');
  });

  it('returns null while the list is empty, so no policy is invented', () => {
    expect(resolveProject([], 'proj-one')).toBeNull();
  });
});

describe('resolveApprovalMode', () => {
  it('reads the policy from the active project', () => {
    expect(resolveApprovalMode(projects[0])).toBe('ask_always');
    expect(resolveApprovalMode(projects[1])).toBe('full_access');
  });

  it('reports the two projects differently rather than one shared default', () => {
    expect(resolveApprovalMode(projects[0])).not.toBe(
      resolveApprovalMode(projects[1])
    );
  });

  it('has no level while no project is active', () => {
    expect(resolveApprovalMode(null)).toBeNull();
  });
});

describe('resolveRunEnvironment', () => {
  const base = {
    useNewWorktree: false,
    gitBranch: 'develop',
    environmentName: ''
  };

  it('keeps a branch the repository reports', () => {
    const resolved = resolveRunEnvironment(base, ['main', 'develop']);

    expect(resolved.gitBranch).toBe('develop');
  });

  it('picks the repository default when no branch is chosen', () => {
    expect(
      resolveRunEnvironment({ ...base, gitBranch: '' }, ['main', 'develop'])
        .gitBranch
    ).toBe('main');
  });

  it('replaces a branch the new workspace does not have', () => {
    expect(
      resolveRunEnvironment({ ...base, gitBranch: 'main' }, [
        'release/2.0',
        'develop'
      ]).gitBranch
    ).toBe('release/2.0');
  });

  it('leaves the environment alone when there are no branches to choose from', () => {
    expect(resolveRunEnvironment(base, [])).toEqual(base);
  });

  it('never touches the worktree flag or the environment name', () => {
    const resolved = resolveRunEnvironment(
      { useNewWorktree: true, gitBranch: 'gone', environmentName: 'staging' },
      ['main']
    );

    expect(resolved).toEqual({
      useNewWorktree: true,
      gitBranch: 'main',
      environmentName: 'staging'
    });
  });
});

describe('environment transitions', () => {
  const base = {
    useNewWorktree: false,
    gitBranch: 'main',
    environmentName: ''
  };

  it('edits the worktree flag and keeps the other two fields', () => {
    expect(changeWorktreeFlag(base, true)).toEqual({
      useNewWorktree: true,
      gitBranch: 'main',
      environmentName: ''
    });
  });

  it('edits the branch and keeps the other two fields', () => {
    expect(changeGitBranch(base, 'develop')).toEqual({
      useNewWorktree: false,
      gitBranch: 'develop',
      environmentName: ''
    });
  });

  it('edits the environment name and keeps the other two fields', () => {
    expect(changeEnvironmentName(base, 'staging')).toEqual({
      useNewWorktree: false,
      gitBranch: 'main',
      environmentName: 'staging'
    });
  });
});
