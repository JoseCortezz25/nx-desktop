import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { Conversation } from '@/shared/domain/conversation.types';
import type { Project } from '@/shared/domain/project.types';
import type { ConversationId } from '@/shared/domain/value-objects.types';
import { getSharedMessages } from '@/shared/i18n/messages';
import { Button } from '../atoms/button';
import { Icon } from '../atoms/icon';
import { ConversationRow } from '../molecules/conversation-row';
import { SidebarProjectGroup } from '../molecules/sidebar-project-group';
import { SidebarSection } from '../molecules/sidebar-section';
import { buildSidebarModel } from './sidebar-model';
import './sidebar.css';

export interface SidebarProps {
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
  /**
   * The sidebar's home affordance: the `Nuevo chat` row. It returns to the home
   * view by clearing the open conversation — the same destination the rail's
   * house icon reports — so the switch out of a conversation is not one-way.
   */
  readonly onNewChat: () => void;
  /**
   * Whether the sidebar is drawn as an on-demand drawer over the main pane
   * instead of a fixed column (#43, narrow windows). It is a presentation mode
   * resolved by the shell; the region's visibility state is untouched, so the
   * rail toggle still opens and closes it exactly as before.
   */
  readonly isOverlay?: boolean;
  /**
   * Dismisses the overlay drawer back to the rail (Escape). The shell passes its
   * region toggle, so the drawer and the rail toggle share one owner of region
   * visibility. Ignored in the column arrangement.
   */
  readonly onClose?: () => void;
}

/**
 * Organism: the toggleable sidebar region (`docs/wireframes/README.md`, "Layout
 * regions"; screens 02 and 11). It composes the region chrome — brand header and
 * new-chat action — with the pinned, project-grouped and recent conversations,
 * projected from the two ports by `buildSidebarModel`. It reads no seed and
 * keeps no local state:
 *
 * - the brand renders the application name `Nx`, never a provider (the #41
 *   product decision recorded in `.claude/knowledge/business-logic.md` §3.6);
 * - the pin state comes from `Conversation.isPinned`;
 * - the active conversation is the id the shell owns, reported back on select.
 */
export function Sidebar({
  projects,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  isOverlay = false,
  onClose
}: SidebarProps) {
  const messages = getSharedMessages();
  const model = buildSidebarModel(
    conversations,
    projects,
    activeConversationId
  );
  const drawerRef = useRef<HTMLElement>(null);

  // The drawer is mounted only while the region is open, so focus moves in on
  // mount and back to whatever opened it (the rail toggle) on unmount — but only
  // when focus is still inside the drawer, so a window that widens back to the
  // column arrangement never steals focus from wherever the user moved it.
  useEffect(() => {
    if (!isOverlay) {
      return;
    }

    const drawer = drawerRef.current;
    const restore =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    drawer?.focus();

    return () => {
      if (restore && drawer?.contains(document.activeElement)) {
        restore.focus();
      }
    };
  }, [isOverlay]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (isOverlay && event.key === 'Escape') {
      event.stopPropagation();
      onClose?.();
    }
  }

  return (
    <aside
      ref={drawerRef}
      className={isOverlay ? 'sidebar sidebar--overlay' : 'sidebar'}
      tabIndex={isOverlay ? -1 : undefined}
      onKeyDown={handleKeyDown}
    >
      {/*
        The header is the static application brand alone. The notifications and
        search controls are deferred (no replacement, no placeholder) and the
        chevron is gone because a static brand has nothing to disclose (#41).
      */}
      <div className="sidebar__header">
        <span className="sidebar__brand">
          <span className="sidebar__brand-name">{messages.sidebar.brand}</span>
        </span>
      </div>

      <div className="sidebar__new-chat">
        <Button variant="list" onPress={onNewChat}>
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
