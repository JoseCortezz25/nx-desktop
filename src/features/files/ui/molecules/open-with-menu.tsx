import { getSharedMessages } from '@/shared/i18n/messages';
import { Button } from '@/shared/ui/atoms/button';
import { Icon } from '@/shared/ui/atoms/icon';
import { IconButton } from '@/shared/ui/molecules/icon-button';
import type { OpenMenuItem } from '../../model/open-menu';
import './open-with-menu.css';

export interface OpenWithMenuProps {
  /** Menu rows, already filtered to the offered and installed targets. */
  readonly items: readonly OpenMenuItem[];
  readonly isExpanded: boolean;
  /** Runs the default action: the first offered target. */
  readonly onOpenPrimary: () => void;
  readonly onToggle: () => void;
}

/**
 * Molecule: the toolbar's `Abrir` split control
 * (`docs/wireframes/24-file-open-menu.html`, `.split`), drawn as one pill holding
 * the default action and the disclosure that opens the target list.
 *
 * With no offered entry the control renders **nothing** at all: §3.5 item 3
 * hides the editor option when VS Code is not installed and lets no other target
 * replace it, so an empty menu is not a menu. It holds no state — the viewer owns
 * whether the list is open — and it does not position the list it discloses, so
 * the viewer anchors that surface.
 */
export function OpenWithMenu({
  items,
  isExpanded,
  onOpenPrimary,
  onToggle
}: OpenWithMenuProps) {
  const messages = getSharedMessages();
  const primary = items[0];

  if (!primary) {
    return null;
  }

  return (
    <span className="open-with-menu">
      <Button
        variant="plain"
        label={messages.fileViewer.openMenu.triggerLabel}
        onPress={onOpenPrimary}
      >
        <Icon name="external" size="sm" />
        <span className="open-with-menu__label">
          {messages.fileViewer.openMenu.triggerLabel}
        </span>
      </Button>
      <span className="open-with-menu__divider" aria-hidden="true" />
      <IconButton
        icon="chevron-down"
        size="sm"
        label={messages.fileViewer.openMenu.menuLabel}
        isExpanded={isExpanded}
        onPress={onToggle}
      />
    </span>
  );
}
