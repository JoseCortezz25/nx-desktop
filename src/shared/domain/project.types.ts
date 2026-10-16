/**
 * A project: a named set of authorized local workspace folders.
 *
 * A project authorizes the workspace roots that every file access is validated
 * against in Rust (`.claude/knowledge/business-logic.md` §3.3), and it owns the
 * two settings the maintainer locked as project-scoped on 2026-10-16 (issue
 * #30): the tool approval policy (`approvalMode`) and the remembered decision
 * for each hook the user declined (`hookDecisions`). Conversations are
 * referenced by id — they are owned by the conversations module — so the project
 * record never duplicates conversation history.
 */
import type { ApprovalMode } from './approval-mode.types';
import type { HookDecision } from './hook.types';
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
  /** Tool approval policy for this project (project-scoped, never global). */
  readonly approvalMode: ApprovalMode;
  /** One decision per reviewed hook, remembered at project scope. */
  readonly hookDecisions: readonly HookDecision[];
  readonly conversationIds: readonly ConversationId[];
}
