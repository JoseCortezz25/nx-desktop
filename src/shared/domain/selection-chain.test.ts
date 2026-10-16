import { describe, expect, it } from 'vitest';
import {
  changeProvider,
  reconcileSelection,
  type ComposerSelection
} from './selection-chain';
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
