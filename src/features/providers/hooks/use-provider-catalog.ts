/**
 * Loads the provider catalog for the shell through the typed provider port.
 *
 * The shell needs the active provider's display name for the sidebar brand, and
 * `docs/wireframes/README.md` forbids hardcoding provider copy. This hook reads
 * the catalog from `ProviderRepository` — backed by the mock factory today, by
 * the typed IPC client once `list_providers` exists — so components never see
 * the data source.
 */
import { useEffect, useState } from 'react';
import type { Provider } from '@/shared/domain/provider.types';
import { createMockProviderRepository } from '../api/mock-provider-repository';

export interface ProviderCatalogState {
  readonly providers: readonly Provider[];
  /** First catalog provider, used as the shell's active provider. */
  readonly activeProvider: Provider | null;
  readonly isLoading: boolean;
}

export function useProviderCatalog(): ProviderCatalogState {
  const [providers, setProviders] = useState<readonly Provider[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;
    const repository = createMockProviderRepository();

    void repository.listProviders().then(catalog => {
      if (isCancelled) {
        return;
      }
      setProviders(catalog);
      setIsLoading(false);
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  return {
    providers,
    activeProvider: providers[0] ?? null,
    isLoading
  };
}
