/**
 * Port for the conversation list behind the sidebar.
 *
 * Pinned and recent views are projections of this list
 * (`docs/wireframes/README.md`, screen 02) computed by later hooks, not extra
 * endpoints. The typed IPC-backed repository implements this port at runtime
 * (#22); the mock factory remains as a test fixture.
 */
import type { Conversation } from '@/shared/domain/conversation.types';

export interface ConversationRepository {
  listConversations(): Promise<readonly Conversation[]>;
}
