/**
 * Wire contracts for the provider catalog (issue #16, slice 2).
 *
 * These `*Dto` shapes are the camelCase JSON that crosses the Tauri boundary.
 * They mirror `src-tauri/src/features/providers/dto.rs` and the shared fixtures
 * in `docs/ipc/fixtures/`. Domain consumers keep using `Provider`/`Model` from
 * `src/shared/domain/`; only the transport layer names the wire shape
 * (`.claude/rules/ipc-and-contracts.md` §1).
 */
import type { EffortLevel } from '@/shared/domain/effort-level.types';

/** One model exposed by a provider, scoped strictly to that provider. */
export interface ModelDto {
  id: string;
  displayName: string;
  providerId: string;
  /**
   * Effort stops supplied by this provider/model. There is no universal
   * ladder; the concrete mapping is #31 (`.claude/knowledge/business-logic.md`
   * §3.1, item 4).
   */
  supportedEffortLevels: EffortLevel[];
}

/** A coding-agent engine and its model catalog. */
export interface ProviderDto {
  id: string;
  displayName: string;
  icon: string;
  subtitle: string;
  availableModels: ModelDto[];
}

/** Request envelope for `list_models`; a model catalog is provider-scoped. */
export interface ListModelsRequestDto {
  providerId: string;
}
