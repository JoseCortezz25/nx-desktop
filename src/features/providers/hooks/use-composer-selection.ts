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
 * `resolveSelection`, so a late-arriving catalog reconciles the user's chosen
 * chain without an effect, and a chosen provider that leaves the catalog
 * falls back to the unselected state rather than to another provider
 * (`.claude/knowledge/business-logic.md` §3.1, item 6).
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
  /**
   * The reconciled chain to render, or `null` while no provider is selected —
   * nothing chosen yet, an empty catalog, or a chosen provider that left the
   * catalog. There is no default provider (decision 2026-10-20).
   */
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

  // A chosen provider that left a loaded catalog drops the choice itself, so
  // the composer returns to the unselected state for good instead of silently
  // re-selecting that provider if it ever comes back. Adjusting state during
  // render (not in an effect) is React's pattern for state derived from props;
  // the guard turns false after the update, so it cannot loop. An empty
  // catalog is "still loading" and keeps the choice.
  if (desiredSelection && !resolved && providers.length > 0) {
    setDesiredSelection(null);
  }

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
