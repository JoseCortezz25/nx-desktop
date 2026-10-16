/**
 * A multi-turn coding conversation and its messages.
 *
 * A conversation owns its history and survives individual failed or cancelled
 * runs (`.claude/knowledge/business-logic.md` §2, §3.2). It links back to its
 * project by id so project data never duplicates conversation history.
 */
import type { FileReference } from './file-reference.types';
import type { ToolCall } from './tool-call.types';
import type {
  ConversationId,
  IsoTimestamp,
  MessageId,
  ProjectId
} from './value-objects.types';

export const MESSAGE_ROLES = ['user', 'assistant', 'system'] as const;

/** Who authored a conversation message. */
export type MessageRole = (typeof MESSAGE_ROLES)[number];

/** One turn in a conversation, optionally carrying tool activity. */
export interface ConversationMessage {
  readonly id: MessageId;
  readonly role: MessageRole;
  readonly content: string;
  readonly createdAt: IsoTimestamp;
  readonly toolCalls: readonly ToolCall[];
  /**
   * Files the message links to inline, rendered as `FileChip`s that emit an
   * open-file request (`docs/wireframes/README.md`, "Reusable components").
   * Optional so a message with nothing to open stays valid.
   */
  readonly fileReferences?: readonly FileReference[];
}

/** A conversation as listed in the sidebar and opened in the main pane. */
export interface Conversation {
  readonly id: ConversationId;
  readonly projectId: ProjectId;
  readonly title: string;
  readonly messages: readonly ConversationMessage[];
  readonly isPinned: boolean;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
}
