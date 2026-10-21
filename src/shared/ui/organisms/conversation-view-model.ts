/**
 * Projects the conversation domain into the rows the conversation view renders.
 *
 * The conversation region (`docs/wireframes/README.md`, screens 11 and 12) draws
 * each `ConversationMessage` with its tool activity, its inline file references
 * and its actions row. All of that is a view of the one `Conversation` the mock
 * conversation repository already serves, so this module keeps the projection
 * pure and testable — the organism only wires it to React and never encodes the
 * mapping or the collapse rule inline.
 *
 * The test runner has no DOM, so the behaviours the ticket names (the collapse
 * toggle, the open-file request, the timestamp) live here or in a hook-free
 * component rather than only inside JSX event wiring.
 */
import type {
  Conversation,
  ConversationMessage,
  MessageRole
} from '@/shared/domain/conversation.types';
import type {
  FileReference,
  OpenFileRequest
} from '@/shared/domain/file-reference.types';
import type { ToolCallKind } from '@/shared/domain/tool-call.types';
import type {
  ConversationId,
  IsoTimestamp,
  MessageId,
  ToolCallId,
  SubagentId
} from '@/shared/domain/value-objects.types';
import type { IconName } from '../atoms/icon';

/** One tool row as the conversation draws it. */
export interface ToolActivityRowView {
  readonly id: ToolCallId;
  readonly icon: IconName;
  readonly summary: string;
  readonly opensChanges: boolean;
  readonly opensSubagentId: SubagentId | null;
}

/** The collapsible tool-activity group of one message, keyed by the message. */
export interface ToolActivityGroupView {
  readonly id: MessageId;
  readonly rows: readonly ToolActivityRowView[];
}

/** One message as the conversation draws it. */
export interface ConversationMessageView {
  readonly id: MessageId;
  readonly role: MessageRole;
  readonly content: string;
  /** 'HH:MM' rendered by the timestamp affordance. */
  readonly timestamp: string;
  readonly fileReferences: readonly FileReference[];
  readonly toolActivity: ToolActivityGroupView | null;
  /** Only assistant turns carry the copy/share actions row. */
  readonly showsActions: boolean;
}

/** The conversation region's render model. */
export interface ConversationViewModel {
  readonly id: ConversationId;
  readonly title: string;
  readonly messages: readonly ConversationMessageView[];
}

/** Glyph per tool kind; the closed kind list cannot ship without one. */
const TOOL_CALL_ICONS: Readonly<Record<ToolCallKind, IconName>> = {
  search: 'search',
  command: 'terminal',
  list_files: 'folder',
  diff: 'git-branch',
  subagent: 'user'
};

/**
 * The sets the view keeps are the **collapsed** group ids, so an empty set means
 * every group starts expanded — the state screen 11 draws.
 */
export const NO_COLLAPSED_GROUPS: ReadonlySet<MessageId> = new Set<MessageId>();

/** Formats a message's `createdAt` into the time the affordance shows. */
export function formatMessageTime(createdAt: IsoTimestamp): string {
  // The domain carries ISO-8601 UTC timestamps, so the time slice is stable and
  // needs no locale (the exact formatting is presentation, not policy).
  return createdAt.slice(11, 16);
}

/**
 * Flips one group in the collapsed set. Returns a new set — the input is never
 * mutated, so it can be used directly as a React state updater — which keeps the
 * single owner free to drive every group.
 */
export function toggleToolGroup(
  collapsedGroupIds: ReadonlySet<MessageId>,
  groupId: MessageId
): ReadonlySet<MessageId> {
  const next = new Set(collapsedGroupIds);
  if (next.has(groupId)) {
    next.delete(groupId);
  } else {
    next.add(groupId);
  }
  return next;
}

/** Builds the open-file request a file chip emits from its path. */
export function createOpenFileRequest(path: string): OpenFileRequest {
  return { path };
}

/** Builds the conversation region's render model from one conversation. */
export function buildConversationViewModel(
  conversation: Conversation
): ConversationViewModel {
  return {
    id: conversation.id,
    title: conversation.title,
    messages: conversation.messages.map(toMessageView)
  };
}

function toMessageView(message: ConversationMessage): ConversationMessageView {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: formatMessageTime(message.createdAt),
    fileReferences: message.fileReferences ?? [],
    toolActivity:
      message.toolCalls.length > 0
        ? {
            id: message.id,
            rows: message.toolCalls.map(call => ({
              id: call.id,
              icon: TOOL_CALL_ICONS[call.kind],
              summary: call.summary,
              opensChanges: call.kind === 'diff',
              opensSubagentId:
                call.kind === 'subagent' ? (call.subagentId ?? null) : null
            }))
          }
        : null,
    showsActions: message.role === 'assistant'
  };
}
