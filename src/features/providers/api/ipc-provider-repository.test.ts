/**
 * Repository tests for the IPC-backed provider catalog (issue #22).
 *
 * The client module is mocked at its boundary, so these tests pin the mapping
 * from the wire catalog to the domain `Provider`/`Model` shapes the composer
 * selection chain consumes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createIpcProviderRepository } from './ipc-provider-repository';
import type { ProviderDto } from './provider.contracts';

const listProviders = vi.hoisted(() => vi.fn());

vi.mock('./provider-client', () => ({ listProviders }));

const catalog: ProviderDto[] = [
  {
    id: 'opencode',
    displayName: 'OpenCode',
    icon: 'opencode',
    subtitle: 'Open-source coding agent',
    availableModels: [
      {
        id: 'deepseek-v3.1',
        displayName: 'DeepSeek V3.1',
        providerId: 'opencode',
        supportedEffortLevels: ['light', 'standard', 'high']
      }
    ]
  }
];

beforeEach(() => {
  listProviders.mockReset();
});

describe('createIpcProviderRepository', () => {
  it('maps the Rust catalog to domain providers and models', async () => {
    listProviders.mockResolvedValue(catalog);
    const repository = createIpcProviderRepository();

    const providers = await repository.listProviders();

    expect(listProviders).toHaveBeenCalledOnce();
    expect(providers).toEqual([
      {
        id: 'opencode',
        displayName: 'OpenCode',
        icon: 'opencode',
        subtitle: 'Open-source coding agent',
        availableModels: [
          {
            id: 'deepseek-v3.1',
            displayName: 'DeepSeek V3.1',
            providerId: 'opencode',
            supportedEffortLevels: ['light', 'standard', 'high']
          }
        ]
      }
    ]);
    expect(providers[0].availableModels[0].supportedEffortLevels).not.toBe(
      catalog[0].availableModels[0].supportedEffortLevels
    );
  });

  it('propagates a rejected client call', async () => {
    listProviders.mockRejectedValue(new Error('ipc unavailable'));
    await expect(createIpcProviderRepository().listProviders()).rejects.toThrow(
      'ipc unavailable'
    );
  });
});
