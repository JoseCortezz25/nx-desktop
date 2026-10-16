import type { Conversation } from '@/shared/domain/conversation.types';
import type { Project } from '@/shared/domain/project.types';
import type { ConversationId } from '@/shared/domain/value-objects.types';
import { getSharedMessages } from '@/shared/i18n/messages';
import { Button } from '../atoms/button';
import { Icon } from '../atoms/icon';
import { ConversationRow } from '../molecules/conversation-row';
import { IconButton } from '../molecules/icon-button';
import { SidebarProjectGroup } from '../molecules/sidebar-project-group';
import { SidebarSection } from '../molecules/sidebar-section';
import { buildSidebarModel } from './sidebar-model';
import './sidebar.css';

export interface SidebarProps {
  /**
   * Display name of the **active** provider, derived by the shell root from the
   * same reconciled selection chain the composer renders. `null` while the
   * catalog is still loading.
   */
  readonly providerName: string | null;
  /** The project list the grouping reads, served by the project port. */
  readonly projects: readonly Project[];
  /** The conversation list, served by the conversation port. */
  readonly conversations: readonly Conversation[];
  /**
   * The conversation the shell has open, or `null`. This is presentation state
   * owned by the shell root; the sidebar only renders it and reports the
   * selection it makes.
   */
  readonly activeConversationId: ConversationId | null;
  readonly onSelectConversation: (conversationId: ConversationId) => void;
}

/**
 * Organism: the toggleable sidebar region (`docs/wireframes/README.md`, "Layout
 * regions"; screens 02 and 11). It composes the region chrome — brand header and
 * new-chat action — with the pinned, project-grouped and recent conversations,
 * projected from the two ports by `buildSidebarModel`. It reads no seed and
 * keeps no local state:
 *
 * - the brand renders the active provider the shell hands down;
 * - the pin state comes from `Conversation.isPinned`;
 * - the active conversation is the id the shell owns, reported back on select.
 */
export function Sidebar({
  providerName,
  projects,
  conversations,
  activeConversationId,
  onSelectConversation
}: SidebarProps) {
  const messages = getSharedMessages();
  const model = buildSidebarModel(
    conversations,
    projects,
    activeConversationId
  );

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <span className="sidebar__brand">
          <span className="sidebar__brand-name">{providerName}</span>
          <Icon name="chevron-down" size="sm" />
        </span>
        <span className="sidebar__tools">
          <IconButton
            icon="bell"
            label={messages.sidebar.notificationsLabel}
            size="sm"
          />
          <IconButton
            icon="search"
            label={messages.sidebar.searchLabel}
            size="sm"
          />
        </span>
      </div>

      <div className="sidebar__new-chat">
        <Button variant="list">
          <Icon name="square-pen" size="md" />
          <span>{messages.sidebar.newChat}</span>
        </Button>
      </div>

      <div className="sidebar__content">
        {model.pinned.length > 0 ? (
          <SidebarSection label={messages.sidebar.pinned}>
            {model.pinned.map(conversation => (
              <ConversationRow
                key={conversation.id}
                title={conversation.title}
                isActive={conversation.isActive}
                onSelect={() => onSelectConversation(conversation.id)}
              />
            ))}
          </SidebarSection>
        ) : null}

        {model.projects.length > 0 ? (
          <SidebarSection label={messages.sidebar.projects}>
            {model.projects.map(project => (
              <SidebarProjectGroup
                key={project.id}
                name={project.name}
                conversations={project.conversations}
                emptyLabel={messages.sidebar.emptyProject}
                onSelectConversation={onSelectConversation}
              />
            ))}
          </SidebarSection>
        ) : null}

        {model.recents.length > 0 ? (
          <SidebarSection label={messages.sidebar.recents}>
            {model.recents.map(conversation => (
              <ConversationRow
                key={conversation.id}
                title={conversation.title}
                isActive={conversation.isActive}
                onSelect={() => onSelectConversation(conversation.id)}
              />
            ))}
          </SidebarSection>
        ) : null}
      </div>
    </aside>
  );
}
