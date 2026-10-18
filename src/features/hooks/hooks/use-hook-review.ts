/** Loads provider hooks through the typed port, ignoring late results on unmount. */
import { useEffect, useState } from 'react';
import type { Hook } from '@/shared/domain/hook.types';
import { createMockHookRepository } from '../api/mock-hook-repository';

export interface HookReviewState {
  readonly hooks: readonly Hook[] | null;
  readonly isLoading: boolean;
}

export function useHookReview(): HookReviewState {
  const [hooks, setHooks] = useState<readonly Hook[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;
    const repository = createMockHookRepository();
    void repository.listHooks().then(next => {
      if (isCancelled) return;
      setHooks(next);
      setIsLoading(false);
    });
    return () => {
      isCancelled = true;
    };
  }, []);

  return { hooks, isLoading };
}
