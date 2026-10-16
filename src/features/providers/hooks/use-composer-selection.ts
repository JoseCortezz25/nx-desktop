/**
 * Owns the composer's `provider -> model -> effort` selection chain for the
 * shell.
 *
 * The active provider is read by two surfaces that must agree: the composer's
 * selectors and the sidebar brand. Keeping the desired chain here — one owner,
 * called once by the shell composition root — is what lets the brand render the
 * *active* provider instead of the catalog's first row, without either surface
 * holding a second copy of the selection (defect carried over from #7).
 *
 * Every value the surfaces render is derived during render by
 * `resolveSelection`, so a late-arriving catalog becomes a valid, reconciled
 * chain without an effect (`.claude/knowledge/business-logic.md` §3.1).
 */
import { useState } from 'react';
import type { EffortLevel } from '@/shared/domain/effort-level.types';
import type { Provider } from '@/shared/domain/provider.types';
import {
  changeProvider,
  reconcileSelection,
  resolveSelection,
  type ComposerSelection,
  type ResolvedSelection
} from '@/shared/domain/selection-chain';
import type { ModelId, ProviderId } from '@/shared/domain/value-objects.types';

export interface ComposerSelectionState {
  /** The reconciled chain to render, or `null` while the catalog is empty. */
  readonly resolved: ResolvedSelection | null;
  /** Transition rule: a provider change resets model and effort (§3.1, item 2). */
  readonly selectProvider: (providerId: ProviderId) => void;
  readonly selectModel: (modelId: ModelId) => void;
  readonly selectEffort: (effortLevel: EffortLevel) => void;
}

export function useComposerSelection(
  providers: readonly Provider[]
): ComposerSelectionState {
  const [desiredSelection, setDesiredSelection] =
    useState<ComposerSelection | null>(null);

  const resolved = resolveSelection(providers, desiredSelection);

  function selectProvider(providerId: ProviderId) {
    setDesiredSelection(changeProvider(providers, providerId));
  }

  function selectModel(modelId: ModelId) {
    const current = resolved?.selection;
    if (!current) {
      return;
    }
    setDesiredSelection(reconcileSelection(providers, { ...current, modelId }));
  }

  function selectEffort(effortLevel: EffortLevel) {
    const current = resolved?.selection;
    if (!current) {
      return;
    }
    setDesiredSelection(
      reconcileSelection(providers, { ...current, effortLevel })
    );
  }

  return { resolved, selectProvider, selectModel, selectEffort };
}
