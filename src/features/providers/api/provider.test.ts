/**
 * Contract and client tests for the provider catalog (issue #16, slice 2).
 *
 * The fixture is the same JSON the Rust suite reads, so a field rename or an
 * enum drift fails on both sides. The typed literals pin the TypeScript view;
 * the client tests pin the command names and the `{ request }` envelope.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import modelsFixture from '../../../../docs/ipc/fixtures/providers-list-models.json';
import providersFixture from '../../../../docs/ipc/fixtures/providers-list-providers.json';
import type {
  ListModelsRequestDto,
  ModelDto,
  ProviderDto
} from './provider.contracts';
import { listModels, listProviders } from './provider-client';

const ipcInvoke = vi.hoisted(() => vi.fn());

vi.mock('@/shared/ipc/client', () => ({ ipcInvoke }));

const expectedModels: ModelDto[] = [
  {
    id: 'deepseek-v3.1',
    displayName: 'DeepSeek V3.1',
    providerId: 'opencode',
    supportedEffortLevels: ['light', 'standard', 'high']
  },
  {
    id: 'kimi-k2',
    displayName: 'Kimi K2',
    providerId: 'opencode',
    supportedEffortLevels: ['light', 'standard']
  }
];

const expectedProviders: ProviderDto[] = [
  {
    id: 'opencode',
    displayName: 'OpenCode',
    icon: 'opencode',
    subtitle: 'Open-source coding agent',
    availableModels: expectedModels
  },
  {
    id: 'codex',
    displayName: 'Codex',
    icon: 'codex',
    subtitle: 'OpenAI coding agent',
    availableModels: [
      {
        id: 'gpt-5-codex',
        displayName: 'GPT-5 Codex',
        providerId: 'codex',
        supportedEffortLevels: ['light', 'standard', 'high', 'extended']
      }
    ]
  }
];

const expectedListModelsRequest: ListModelsRequestDto = {
  providerId: 'opencode'
};

beforeEach(() => {
  ipcInvoke.mockReset();
});

describe('provider fixtures', () => {
  it('match the typed provider catalog', () => {
    expect(providersFixture.response).toEqual(expectedProviders);
  });

  it('match the typed model catalog and request envelope', () => {
    expect(modelsFixture.response).toEqual(expectedModels);
    expect(modelsFixture.request).toEqual(expectedListModelsRequest);
  });
});

describe('provider client', () => {
  it('calls list_providers without an envelope', async () => {
    ipcInvoke.mockResolvedValue(expectedProviders);
    await expect(listProviders()).resolves.toEqual(expectedProviders);
    expect(ipcInvoke).toHaveBeenCalledWith('list_providers');
  });

  it('calls list_models with the { request } envelope', async () => {
    ipcInvoke.mockResolvedValue(expectedModels);
    await expect(listModels('opencode')).resolves.toEqual(expectedModels);
    expect(ipcInvoke).toHaveBeenCalledWith('list_models', {
      request: expectedListModelsRequest
    });
  });
});
