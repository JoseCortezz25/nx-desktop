/**
 * Wire contracts for the conversation catalog (issue #16, slice 2).
 *
 * A conversation owns its history and references its project by id
 * (`.claude/knowledge/business-logic.md` §2). These `*Dto` shapes mirror
 * `src-tauri/src/features/conversations/dto.rs` and the shared fixtures; the
 * domain `Conversation` stays in `src/shared/domain/`.
 */
import type { MessageRole } from '@/shared/domain/conversation.types';
import type {
  ToolCallKind,
  ToolCallStatus
} from '@/shared/domain/tool-call.types';
import type {
  ConversationId,
  IsoTimestamp,
  ProjectId,
  SubagentId
} from '@/shared/domain/value-objects.types';

/** A file a message points at inline; the chip only asks to open it. */
export interface FileReferenceDto {
  path: string;
}

/** A tool invocation surfaced inside a conversation message. */
export interface ToolCallDto {
  id: string;
  kind: ToolCallKind;
  summary: string;
  detail: string;
  status: ToolCallStatus;
  /** Child run opened by a subagent activity row; absent for other tools. */
  subagentId?: SubagentId;
}

/** One turn in a conversation, optionally carrying tool activity. */
export interface ConversationMessageDto {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: IsoTimestamp;
  toolCalls: ToolCallDto[];
  fileReferences?: FileReferenceDto[];
}

/** A conversation as listed in the sidebar and opened in the main pane. */
export interface ConversationDto {
  id: ConversationId;
  projectId: ProjectId;
  title: string;
  messages: ConversationMessageDto[];
  isPinned: boolean;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

/** Request envelope for `create_conversation`; the core derives a title if absent. */
export interface CreateConversationRequestDto {
  projectId: ProjectId;
  title?: string;
}
