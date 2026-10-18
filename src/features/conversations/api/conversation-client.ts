/**
 * Typed IPC client for the conversation catalog (issue #16, slice 2).
 *
 * `listConversations` is the port shape the sidebar already consumes;
 * `createConversation` carries the authority-bearing `projectId`. The Rust
 * service and command registration land in #18.
 */
import type { ProjectId } from '@/shared/domain/value-objects.types';
import { ipcInvoke } from '@/shared/ipc/client';
import type {
  ConversationDto,
  CreateConversationRequestDto
} from './conversation.contracts';

/** Lists every conversation; pinned and recent views are projections. */
export function listConversations(): Promise<ConversationDto[]> {
  return ipcInvoke<ConversationDto[]>('list_conversations');
}

/** Creates one conversation in `projectId`; the core derives a title if omitted. */
export function createConversation(
  projectId: ProjectId,
  title?: string
): Promise<ConversationDto> {
  const request: CreateConversationRequestDto =
    title === undefined ? { projectId } : { projectId, title };
  return ipcInvoke<ConversationDto>('create_conversation', { request });
}
