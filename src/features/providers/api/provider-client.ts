/**
 * Typed IPC client for the provider catalog (issue #16, slice 2).
 *
 * Commands are intent-driven `snake_case`; parameterized calls pass the
 * `{ request }` envelope documented in `docs/ipc/README.md`. The Rust service
 * and command registration land in #17, so this module defines the seam only.
 */
import { ipcInvoke } from '@/shared/ipc/client';
import type {
  ListModelsRequestDto,
  ModelDto,
  ProviderDto
} from './provider.contracts';

/** Lists every configured provider and its advertised models. */
export function listProviders(): Promise<ProviderDto[]> {
  return ipcInvoke<ProviderDto[]>('list_providers');
}

/** Lists the models of one provider; it never accepts a cross-provider id. */
export function listModels(providerId: string): Promise<ModelDto[]> {
  const request: ListModelsRequestDto = { providerId };
  return ipcInvoke<ModelDto[]>('list_models', { request });
}
