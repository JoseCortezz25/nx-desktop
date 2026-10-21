/**
 * IPC-backed conversation catalog (issue #22).
 *
 * Implements the existing `ConversationRepository` port over
 * `list_conversations`. The Rust seed and every created conversation now own
 * the sidebar's data; the projection into pinned/projects/recent stays in the
 * sidebar.
 */
import type {
  Conversation,
  ConversationMessage
} from '@/shared/domain/conversation.types';
import type { FileReference } from '@/shared/domain/file-reference.types';
import type { ToolCall } from '@/shared/domain/tool-call.types';
import { listConversations } from './conversation-client';
import type {
  ConversationDto,
  ConversationMessageDto,
  FileReferenceDto,
  ToolCallDto
} from './conversation.contracts';
import type { ConversationRepository } from './conversation-repository';

function toToolCall(dto: ToolCallDto): ToolCall {
  return {
    id: dto.id as ToolCall['id'],
    kind: dto.kind,
    summary: dto.summary,
    detail: dto.detail,
    status: dto.status,
    subagentId: dto.subagentId
  };
}

function toFileReference(dto: FileReferenceDto): FileReference {
  return { path: dto.path };
}

function toMessage(dto: ConversationMessageDto): ConversationMessage {
  return {
    id: dto.id as ConversationMessage['id'],
    role: dto.role,
    content: dto.content,
    createdAt: dto.createdAt,
    toolCalls: dto.toolCalls.map(toToolCall),
    fileReferences: dto.fileReferences?.map(toFileReference)
  };
}

function toConversation(dto: ConversationDto): Conversation {
  return {
    id: dto.id,
    projectId: dto.projectId,
    title: dto.title,
    messages: dto.messages.map(toMessage),
    isPinned: dto.isPinned,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt
  };
}

/** Builds the conversation port over the typed IPC client. */
export function createIpcConversationRepository(): ConversationRepository {
  return {
    listConversations() {
      return listConversations().then(rows => rows.map(toConversation));
    }
  };
}
