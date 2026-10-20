/**
 * Port for the provider catalog.
 *
 * The typed IPC-backed repository implements this port at runtime (#22); the
 * mock factory remains as a test fixture. Consumers never change when the
 * transport does. See `.opencode/rules/folder-structure.md` (IPC clients live
 * in `src/features/<feature>/api/`).
 */
import type { Provider } from '@/shared/domain/provider.types';

export interface ProviderRepository {
  listProviders(): Promise<readonly Provider[]>;
}
