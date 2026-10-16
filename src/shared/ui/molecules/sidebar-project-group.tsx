import type { ConversationId } from '@/shared/domain/value-objects.types';
import { Icon } from '../atoms/icon';
import { ConversationRow } from './conversation-row';
import './sidebar-project-group.css';

/** A conversation nested under its project, as the model projects it. */
export interface SidebarProjectConversation {
  readonly id: ConversationId;
  readonly title: string;
  readonly isActive: boolean;
}

export interface SidebarProjectGroupProps {
  /** Project name drawn as the group's header row. */
  readonly name: string;
  readonly conversations: readonly SidebarProjectConversation[];
  /** Copy drawn when the project groups no conversations. */
  readonly emptyLabel: string;
  readonly onSelectConversation: (conversationId: ConversationId) => void;
}

/**
 * Molecule: one project and the conversations grouped under it
 * (`docs/wireframes/11-chat-conversation-sidebar.html`: a project row followed
 * by its nested, indented conversations). The project row is a label, not a
 * control — navigating to a project's page is not specified yet — so it is
 * drawn as plain markup.
 */
export function SidebarProjectGroup({
  name,
  conversations,
  emptyLabel,
  onSelectConversation
}: SidebarProjectGroupProps) {
  return (
    <div className="sidebar-project">
      <div className="sidebar-project__name">
        <Icon name="folder" size="sm" />
        <span>{name}</span>
      </div>

      {conversations.length === 0 ? (
        <p className="sidebar-project__empty">{emptyLabel}</p>
      ) : (
        <div className="sidebar-project__conversations">
          {conversations.map(conversation => (
            <ConversationRow
              key={conversation.id}
              title={conversation.title}
              isActive={conversation.isActive}
              onSelect={() => onSelectConversation(conversation.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
