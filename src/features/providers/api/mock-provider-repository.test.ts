import { describe, expect, it } from 'vitest';
import { changeProvider } from '@/shared/domain/selection-chain';
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
});
