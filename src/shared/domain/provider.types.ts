/**
 * Provider catalog: a coding-agent engine and the models it exposes.
 *
 * A `Provider` is not a plain chat endpoint; it may manage sessions, tools, and
 * several models (`.claude/knowledge/business-logic.md` §2). Catalog data is
 * always supplied at runtime — a mock repository today, the typed IPC client
 * later — and is never hardcoded UI copy (`docs/wireframes/README.md`, ground
 * rules).
 */
import type { EffortLevel } from './effort-level.types';
import type { ModelId, ProviderId } from './value-objects.types';

/** A model offered by a provider, scoped strictly to that provider. */
export interface Model {
  readonly id: ModelId;
  readonly displayName: string;
  readonly providerId: ProviderId;
  readonly supportedEffortLevels: readonly EffortLevel[];
}

/** A coding-agent engine and its model catalog. */
export interface Provider {
  readonly id: ProviderId;
  readonly displayName: string;
  readonly icon: string;
  readonly subtitle: string;
  readonly availableModels: readonly Model[];
}
