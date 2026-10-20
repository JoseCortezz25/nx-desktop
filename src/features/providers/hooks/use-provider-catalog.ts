/**
 * Loads the provider catalog for the shell through the typed provider port.
 *
 * The catalog is the input the shell reconciles the composer's selection chain
 * against; the *active* provider is a projection of that chain, not "the first
 * catalog row", so this hook deliberately exposes only the list. Backed by the
 * typed IPC client through the `ProviderRepository` port.
 */
import { useEffect, useState } from 'react';
import type { Provider } from '@/shared/domain/provider.types';
import { createIpcProviderRepository } from '../api/ipc-provider-repository';

export interface ProviderCatalogState {
  readonly providers: readonly Provider[];
  readonly isLoading: boolean;
}

export function useProviderCatalog(): ProviderCatalogState {
  const [providers, setProviders] = useState<readonly Provider[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;
    const repository = createIpcProviderRepository();

    void repository
      .listProviders()
      .then(catalog => {
        if (isCancelled) {
          return;
        }
        setProviders(catalog);
        setIsLoading(false);
      })
      .catch(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  return { providers, isLoading };
}
