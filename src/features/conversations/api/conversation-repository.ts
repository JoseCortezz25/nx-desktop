/**
 * Port for the conversation list behind the sidebar.
 *
 * Pinned and recent views are projections of this list
 * (`docs/wireframes/README.md`, screen 02) computed by later hooks, not extra
 * endpoints. Backed by the mock repository today and by the future typed IPC
 * client (`conversation-client.ts`) once `list_conversations` exists.
 */
import type { Conversation } from '@/shared/domain/conversation.types';

export interface ConversationRepository {
  listConversations(): Promise<readonly Conversation[]>;
}
