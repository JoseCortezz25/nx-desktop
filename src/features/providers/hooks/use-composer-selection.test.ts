/**
 * Hook tests for `useComposerSelection` (decision 2026-10-20: no default
 * provider).
 *
 * The composer starts unselected even with a loaded catalog, an explicit
 * provider choice enables the `provider -> model -> effort` chain, and a chosen
 * provider that leaves the catalog returns the composer to the unselected
 * state instead of falling back to another provider.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Provider } from '@/shared/domain/provider.types';
import { renderHook } from '@/shared/testing/hook-runner';
import { useComposerSelection } from './use-composer-selection';

vi.mock('react', async () => {
  const { reactHookMock } = await import('@/shared/testing/hook-runner');
  return reactHookMock;
});

const alpha: Provider = {
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
    }
  ]
};

const beta: Provider = {
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
    },
    {
      id: 'beta-two',
      displayName: 'Beta Two',
      providerId: 'beta',
      supportedEffortLevels: ['high', 'maximum']
    }
  ]
};

const catalog: readonly Provider[] = [alpha, beta];

describe('useComposerSelection', () => {
  it('starts unselected with a loaded catalog', () => {
    const hook = renderHook(useComposerSelection, catalog);

    expect(hook.result().resolved).toBeNull();
  });

  it('ignores model and effort changes while no provider is selected', () => {
    const hook = renderHook(useComposerSelection, catalog);

    hook.result().selectModel('beta-one');
    hook.result().selectEffort('maximum');
    hook.rerender();

    expect(hook.result().resolved).toBeNull();
  });

  it('enables the chain once a provider is chosen', () => {
    const hook = renderHook(useComposerSelection, catalog);

    hook.result().selectProvider('beta');
    hook.rerender();

    expect(hook.result().resolved?.selection).toEqual({
      providerId: 'beta',
      modelId: 'beta-one',
      effortLevel: 'maximum'
    });

    hook.result().selectModel('beta-two');
    hook.rerender();
    hook.result().selectEffort('high');
    hook.rerender();

    expect(hook.result().resolved?.selection).toEqual({
      providerId: 'beta',
      modelId: 'beta-two',
      effortLevel: 'high'
    });
  });

  it('returns to unselected when the chosen provider leaves the catalog', () => {
    const hook = renderHook(useComposerSelection, catalog);

    hook.result().selectProvider('beta');
    hook.rerender();
    hook.rerender([alpha]);

    expect(hook.result().resolved).toBeNull();

    // The choice itself was dropped: the provider coming back does not
    // re-select it on the user's behalf.
    hook.rerender(catalog);
    expect(hook.result().resolved).toBeNull();
  });

  it('keeps the choice while the catalog is momentarily empty', () => {
    const hook = renderHook(useComposerSelection, catalog);

    hook.result().selectProvider('alpha');
    hook.rerender();
    hook.rerender([]);
    expect(hook.result().resolved).toBeNull();

    hook.rerender(catalog);
    expect(hook.result().resolved?.provider.id).toBe('alpha');
  });
});
