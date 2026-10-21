/**
 * IPC-backed provider catalog (issue #22).
 *
 * Implements the existing `ProviderRepository` port over `list_providers`, so
 * the shell's hook swaps its mock factory for this one without changing any
 * component. The Rust command returns providers with their models embedded;
 * the wire ids are validated in Rust and branded here for the domain.
 */
import type { Provider, Model } from '@/shared/domain/provider.types';
import type { ModelId, ProviderId } from '@/shared/domain/value-objects.types';
import { listProviders } from './provider-client';
import type { ProviderDto } from './provider.contracts';
import type { ProviderRepository } from './provider-repository';

function toModel(dto: ProviderDto['availableModels'][number]): Model {
  return {
    id: dto.id as ModelId,
    displayName: dto.displayName,
    providerId: dto.providerId as ProviderId,
    supportedEffortLevels: [...dto.supportedEffortLevels]
  };
}

function toProvider(dto: ProviderDto): Provider {
  return {
    id: dto.id as ProviderId,
    displayName: dto.displayName,
    icon: dto.icon,
    subtitle: dto.subtitle,
    availableModels: dto.availableModels.map(toModel)
  };
}

/** Builds the provider port over the typed IPC client. */
export function createIpcProviderRepository(): ProviderRepository {
  return {
    listProviders() {
      return listProviders().then(rows => rows.map(toProvider));
    }
  };
}
