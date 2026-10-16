/**
 * Port for the provider catalog.
 *
 * The mock repository backs it today; the future typed IPC client
 * (`provider-client.ts`) will implement this same interface against the
 * `list_providers` Tauri command, so consumers never change when the Rust core
 * lands. See `.opencode/rules/folder-structure.md` (IPC clients live in
 * `src/features/<feature>/api/`).
 */
import type { Provider } from '@/shared/domain/provider.types';

export interface ProviderRepository {
  listProviders(): Promise<readonly Provider[]>;
}
