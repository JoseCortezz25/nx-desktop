/**
 * A project: a named set of authorized local workspace folders.
 *
 * A project authorizes the workspace roots that every file access is validated
 * against in Rust (`.claude/knowledge/business-logic.md` §3.3). Conversations
 * are referenced by id — they are owned by the conversations module — so the
 * project record never duplicates conversation history.
 */
import type {
  ConversationId,
  ProjectId,
  WorkspacePath
} from './value-objects.types';

export interface Project {
  readonly id: ProjectId;
  readonly name: string;
  /** One or more authorized local source directories. */
  readonly workspaceFolders: readonly WorkspacePath[];
  readonly conversationIds: readonly ConversationId[];
}
