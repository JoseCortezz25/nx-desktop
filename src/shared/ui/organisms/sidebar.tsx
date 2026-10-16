import type { ReactNode } from 'react';
import { getSharedMessages } from '@/shared/i18n/messages';
import { Button } from '../atoms/button';
import { Icon } from '../atoms/icon';
import { IconButton } from '../molecules/icon-button';
import './sidebar.css';

export interface SidebarProps {
  /**
   * Display name of the active provider, resolved by the shell root from the
   * typed provider port. `null` while the catalog is still loading.
   */
  readonly providerName: string | null;
  /** Content slot: pinned, projects, and recents (#10). */
  readonly children?: ReactNode;
}

/**
 * Organism: the toggleable sidebar region (`docs/wireframes/README.md`,
 * "Layout regions"). It ships the region chrome — brand header and the
 * new-chat action — and reserves the scrollable slot that #10 fills.
 */
export function Sidebar({ providerName, children }: SidebarProps) {
  const messages = getSharedMessages();

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

      <div className="sidebar__content">{children}</div>
    </aside>
  );
}
