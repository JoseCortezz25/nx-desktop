/**
 * Loads the conversation list behind the sidebar through the typed conversation
 * port.
 *
 * Pinned, project and recent views are projections of this one list
 * (`docs/wireframes/README.md`, screen 02) computed by the sidebar, so this hook
 * only resolves the list. The seed is never read directly: the mock factory
 * today, the typed IPC client once `list_conversations` exists.
 */
import { useEffect, useState } from 'react';
import type { Conversation } from '@/shared/domain/conversation.types';
import { createMockConversationRepository } from '../api/mock-conversation-repository';

export interface ConversationCatalogState {
  readonly conversations: readonly Conversation[];
  readonly isLoading: boolean;
}

export function useConversationCatalog(): ConversationCatalogState {
  const [conversations, setConversations] = useState<readonly Conversation[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;
    const repository = createMockConversationRepository();

    void repository.listConversations().then(catalog => {
      if (isCancelled) {
        return;
      }
      setConversations(catalog);
      setIsLoading(false);
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  return { conversations, isLoading };
}
