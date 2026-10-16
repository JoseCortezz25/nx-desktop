/**
 * Projects the conversation and project ports into the sidebar's three groups.
 *
 * The sidebar (`docs/wireframes/README.md`, "Layout regions"; screens 02 and
 * 11) renders **pinned** conversations, **projects** grouping their
 * conversations, and **recents**. All three are views of the same two lists, so
 * this module keeps the slicing pure and testable — the organism only wires it
 * to React and never encodes the grouping inline.
 *
 * The pin state is read from `Conversation.isPinned` and the grouping from
 * `Conversation.projectId`; the sidebar invents neither, so a conversation moves
 * groups only when the domain moves it.
 */
import type { Conversation } from '@/shared/domain/conversation.types';
import type { Project } from '@/shared/domain/project.types';
import type {
  ConversationId,
  ProjectId
} from '@/shared/domain/value-objects.types';

/** One conversation row as the sidebar draws it. */
export interface SidebarConversation {
  readonly id: ConversationId;
  readonly title: string;
  /** The conversation the shell has open, highlighted in place. */
  readonly isActive: boolean;
}

/** A project and the conversations grouped under it. */
export interface SidebarProjectEntry {
  readonly id: ProjectId;
  readonly name: string;
  readonly conversations: readonly SidebarConversation[];
}

/** The three groups the sidebar renders, in draw order. */
export interface SidebarModel {
  readonly pinned: readonly SidebarConversation[];
  readonly projects: readonly SidebarProjectEntry[];
  readonly recents: readonly SidebarConversation[];
}

/** Most recently updated first; ISO-8601 UTC strings sort lexicographically. */
function byUpdatedAtDesc(left: Conversation, right: Conversation): number {
  return right.updatedAt.localeCompare(left.updatedAt);
}

function toRow(
  conversation: Conversation,
  activeConversationId: ConversationId | null
): SidebarConversation {
  return {
    id: conversation.id,
    title: conversation.title,
    isActive: conversation.id === activeConversationId
  };
}

/**
 * Builds the sidebar model from the two ports.
 *
 * `pinned` and `recents` are cross-project views of the list: pinned
 * conversations first, then every unpinned conversation by recency. `projects`
 * keeps the catalog order and nests each project's own conversations, so the
 * grouping reads as the project list the user recognizes.
 */
export function buildSidebarModel(
  conversations: readonly Conversation[],
  projects: readonly Project[],
  activeConversationId: ConversationId | null
): SidebarModel {
  const sorted = [...conversations].sort(byUpdatedAtDesc);

  return {
    pinned: sorted
      .filter(conversation => conversation.isPinned)
      .map(conversation => toRow(conversation, activeConversationId)),
    projects: projects.map(project => ({
      id: project.id,
      name: project.name,
      conversations: sorted
        .filter(conversation => conversation.projectId === project.id)
        .map(conversation => toRow(conversation, activeConversationId))
    })),
    recents: sorted
      .filter(conversation => !conversation.isPinned)
      .map(conversation => toRow(conversation, activeConversationId))
  };
}
