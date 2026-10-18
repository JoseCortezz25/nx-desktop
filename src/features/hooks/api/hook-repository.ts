/**
 * Port for reading the provider-reported hooks awaiting review.
 *
 * Backed by the mock repository today and by a future typed IPC client once
 * the Rust core exposes hooks. Views never read provider configuration directly.
 */
import type { Hook } from '@/shared/domain/hook.types';

export interface HookRepository {
  listHooks(): Promise<readonly Hook[]>;
}
