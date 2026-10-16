import { describe, expect, it } from 'vitest';
import {
  changeProvider,
  reconcileSelection,
  resolveSelection
} from '@/shared/domain/selection-chain';
import { createMockProviderRepository } from './mock-provider-repository';

/**
 * Guards the two properties the ticket requires of the mock data source: the
 * repository is usable through the port contract, and providers genuinely differ
 * so later UI cannot be built against a degenerate single-provider catalog.
 *
 * The effort stops are placeholders (see the repository header): there is no
 * universal ladder to assert membership against, so the tests only assert that
 * every model advertises at least one stop.
 */
describe('mock provider repository', () => {
  it('serves the catalog through the ProviderRepository port', async () => {
    const providers = await createMockProviderRepository().listProviders();
    expect(providers.map(provider => provider.id)).toEqual([
      'opencode',
      'codex',
      'claude'
    ]);
  });

  it('keeps every model scoped to its own provider', async () => {
    const providers = await createMockProviderRepository().listProviders();
    for (const provider of providers) {
      expect(provider.availableModels.length).toBeGreaterThan(0);
      for (const model of provider.availableModels) {
        expect(model.providerId).toBe(provider.id);
      }
    }
  });

  it('gives every model at least one placeholder effort stop', async () => {
    const providers = await createMockProviderRepository().listProviders();
    for (const provider of providers) {
      for (const model of provider.availableModels) {
        expect(model.supportedEffortLevels.length).toBeGreaterThan(0);
        for (const effortLevel of model.supportedEffortLevels) {
          expect(effortLevel.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('makes providers and their model sets differ', async () => {
    const providers = await createMockProviderRepository().listProviders();
    const modelSets = providers.map(provider =>
      provider.availableModels.map(model => model.id).join(',')
    );
    expect(new Set(modelSets).size).toBe(providers.length);
  });

  it('resets the chain to a model of the new provider when switching', async () => {
    const providers = await createMockProviderRepository().listProviders();
    const opencode = changeProvider(providers, 'opencode');
    const claude = changeProvider(providers, 'claude');

    expect(opencode?.modelId).toBe('deepseek-v3.1');
    expect(claude?.modelId).toBe('claude-opus-4-6');
    expect(claude?.modelId).not.toBe(opencode?.modelId);
  });

  it('resets both model and effort to valid values on a provider switch, for two providers', async () => {
    const providers = await createMockProviderRepository().listProviders();

    // Before: OpenCode with its widest model at its last stop.
    const before = resolveSelection(providers, {
      providerId: 'opencode',
      modelId: 'glm-4.6',
      effortLevel: 'maximum'
    });
    expect(before?.selection).toEqual({
      providerId: 'opencode',
      modelId: 'glm-4.6',
      effortLevel: 'maximum'
    });

    // After: the transition rule resets model AND effort for the new provider.
    const codex = changeProvider(providers, 'codex');
    expect(codex).toEqual({
      providerId: 'codex',
      modelId: 'gpt-5-codex',
      effortLevel: 'light'
    });

    const claude = changeProvider(providers, 'claude');
    expect(claude).toEqual({
      providerId: 'claude',
      modelId: 'claude-opus-4-6',
      effortLevel: 'standard'
    });

    // Neither new model is the one that was selected before the switch.
    expect(codex?.modelId).not.toBe(before?.selection.modelId);
    expect(claude?.modelId).not.toBe(before?.selection.modelId);
  });

  it('reconciles a model and an effort the new provider does not have', async () => {
    const providers = await createMockProviderRepository().listProviders();

    // A chain carried over from OpenCode (glm-4.6 / maximum) against Codex:
    // neither the model nor the stop exists there, so both reset.
    const reconciled = reconcileSelection(providers, {
      providerId: 'codex',
      modelId: 'glm-4.6',
      effortLevel: 'maximum'
    });
    expect(reconciled).toEqual({
      providerId: 'codex',
      modelId: 'gpt-5-codex',
      effortLevel: 'light'
    });
  });

  it('reports each model its own stop count, and the mock models differ', async () => {
    const providers = await createMockProviderRepository().listProviders();
    const opencode = providers.find(provider => provider.id === 'opencode');
    const narrow = opencode?.availableModels.find(
      model => model.id === 'kimi-k2'
    );
    const wide = opencode?.availableModels.find(
      model => model.id === 'glm-4.6'
    );

    // Placeholder counts owned by the mock fixture (see the repository header).
    expect(narrow?.supportedEffortLevels.length).toBe(2);
    expect(wide?.supportedEffortLevels.length).toBe(4);
    expect(narrow?.supportedEffortLevels.length).not.toBe(
      wide?.supportedEffortLevels.length
    );

    // The resolved chain exposes the selected model's stops, never a shared set.
    const narrowResolved = resolveSelection(providers, {
      providerId: 'opencode',
      modelId: 'kimi-k2',
      effortLevel: 'light'
    });
    const wideResolved = resolveSelection(providers, {
      providerId: 'opencode',
      modelId: 'glm-4.6',
      effortLevel: 'maximum'
    });

    expect(narrowResolved?.effortLevels).toEqual(narrow?.supportedEffortLevels);
    expect(wideResolved?.effortLevels).toEqual(wide?.supportedEffortLevels);
    expect(narrowResolved?.effortLevels.length).not.toBe(
      wideResolved?.effortLevels.length
    );
  });
});
