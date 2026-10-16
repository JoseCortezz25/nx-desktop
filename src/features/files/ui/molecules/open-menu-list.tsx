import { getSharedMessages, getOpenTargetLabel } from '@/shared/i18n/messages';
import { Button } from '@/shared/ui/atoms/button';
import { Icon } from '@/shared/ui/atoms/icon';
import type { OpenTarget } from '@/shared/domain/open-target.types';
import type { OpenMenuItem } from '../../model/open-menu';
import './open-menu-list.css';

export interface OpenMenuListProps {
  readonly items: readonly OpenMenuItem[];
  readonly onSelect: (target: OpenTarget) => void;
}

/**
 * Molecule: the rows of the `Abrir` menu
 * (`docs/wireframes/24-file-open-menu.html`, `.menu-pop`). It draws the entries
 * the panel's model offers and reports the chosen target up; it holds no state
 * and does not dismiss itself — the viewer does, because the viewer owns whether
 * the surface is open.
 */
export function OpenMenuList({ items, onSelect }: OpenMenuListProps) {
  const messages = getSharedMessages();

  return (
    <div
      className="open-menu-list"
      role="menu"
      aria-label={messages.fileViewer.openMenu.menuLabel}
    >
      {items.map(item => (
        <Button
          key={item.target}
          variant="list"
          role="menuitem"
          label={getOpenTargetLabel(item.target)}
          onPress={() => onSelect(item.target)}
        >
          <Icon name="external" size="sm" />
          <span className="open-menu-list__label">
            {getOpenTargetLabel(item.target)}
          </span>
        </Button>
      ))}
    </div>
  );
}
