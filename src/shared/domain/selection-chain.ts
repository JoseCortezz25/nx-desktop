/**
 * Composer selection chain (`provider -> model -> effort`).
 *
 * Implements the invariant stated in `docs/wireframes/README.md`: "Selection
 * chain in the composer: provider -> model -> effort. Changing the provider must
 * reset the model to a valid one for that provider", expanded by
 * `.claude/knowledge/business-logic.md` §3.1.
 *
 * Every helper is pure: it reads the supplied catalog and returns a new value,
 * never mutating the input. The stale-response concurrency rule (§3.1, item 3)
 * is a client concern and deliberately lives outside these functions.
 */
import type { EffortLevel } from './effort-level.types';
import type { Model, Provider } from './provider.types';
import type { ModelId, ProviderId } from './value-objects.types';

/** A fully reconciled chain ready to be sent with a run request. */
export interface ComposerSelection {
  readonly providerId: ProviderId;
  readonly modelId: ModelId;
  readonly effortLevel: EffortLevel;
}

function findProvider(
  providers: readonly Provider[],
  providerId: ProviderId
): Provider | undefined {
  return providers.find(provider => provider.id === providerId);
}

function findModel(provider: Provider, modelId: ModelId): Model | undefined {
  return provider.availableModels.find(model => model.id === modelId);
}

/**
 * The chain a provider starts from: its first catalog model (the wireframes'
 * "default"/recommended entry) at that model's first supported effort stop.
 */
function defaultSelection(provider: Provider): ComposerSelection | null {
  const model = provider.availableModels[0];
  const effortLevel = model?.supportedEffortLevels[0];
  if (!model || !effortLevel) {
    return null;
  }
  return { providerId: provider.id, modelId: model.id, effortLevel };
}

/**
 * Resets the chain for a provider change.
 *
 * Returns the provider's default model and effort, discarding the previous
 * selection, or `null` when the provider is unknown to the catalog.
 */
export function changeProvider(
  providers: readonly Provider[],
  nextProviderId: ProviderId
): ComposerSelection | null {
  const provider = findProvider(providers, nextProviderId);
  return provider ? defaultSelection(provider) : null;
}

/**
 * Reconciles a desired chain against the catalog.
 *
 * A model that does not belong to the requested provider — the classic result of
 * switching provider — is replaced by the provider's default model. An effort
 * stop the chosen model does not support falls back to that model's first
 * supported stop. Returns `null` when the provider is unknown or the resolved
 * model advertises no effort stops.
 */
export function reconcileSelection(
  providers: readonly Provider[],
  desired: ComposerSelection
): ComposerSelection | null {
  const provider = findProvider(providers, desired.providerId);
  if (!provider) {
    return null;
  }

  const model = findModel(provider, desired.modelId);
  if (!model) {
    return defaultSelection(provider);
  }

  const effortLevel = model.supportedEffortLevels.includes(desired.effortLevel)
    ? desired.effortLevel
    : model.supportedEffortLevels[0];
  if (!effortLevel) {
    return null;
  }

  return { providerId: provider.id, modelId: model.id, effortLevel };
}
