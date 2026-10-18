import { getSharedMessages } from '@/shared/i18n/messages';
import { Button } from '@/shared/ui/atoms/button';
import { Icon } from '@/shared/ui/atoms/icon';
import { IconButton } from '@/shared/ui/molecules/icon-button';
import type { PanelTab } from '../../model/file-tabs';
import './file-tab-strip.css';

export interface FileTabStripProps {
  /** The panel's open tabs, in the order they were opened. */
  readonly tabs: readonly PanelTab[];
  /** The focused tab, or `null` while nothing is open. */
  readonly activeTabId: string | null;
  readonly onActivate: (tabId: string) => void;
  readonly onClose: (tabId: string) => void;
}

/**
 * Molecule: the right panel's tab strip
 * (`docs/wireframes/23-file-viewer-markdown.html`, `.main .tabs`; screens 13 and
 * 18). One tab per opened file, each with its own close control, plus the single
 * `Cambios` tab the diff activity opens — drawn with the changes glyph and no
 * close control, exactly as screen 18 draws it. It owns no state: the panel owns
 * which tabs exist and which one is focused, so the strip can never disagree with
 * the viewer underneath it.
 */
export function FileTabStrip({
  tabs,
  activeTabId,
  onActivate,
  onClose
}: FileTabStripProps) {
  const messages = getSharedMessages();

  return (
    <div
      className="file-tab-strip"
      role="tablist"
      aria-label={messages.fileViewer.tabs.listLabel}
    >
      {tabs.map(tab => {
        const isActive = tab.id === activeTabId;

        return (
          <div
            key={tab.id}
            className={`file-tab-strip__tab${
              isActive ? ' file-tab-strip__tab--active' : ''
            }`}
          >
            <Button
              variant="plain"
              role="tab"
              isSelected={isActive}
              label={tab.kind === 'file' ? tab.path : tab.name}
              onPress={() => onActivate(tab.id)}
            >
              <Icon
                name={tab.kind === 'file' ? 'file' : 'git-branch'}
                size="sm"
              />
              <span className="file-tab-strip__name">{tab.name}</span>
            </Button>
            {tab.kind === 'file' ? (
              <IconButton
                icon="close"
                size="sm"
                label={messages.fileViewer.tabs.closeLabel(tab.name)}
                onPress={() => onClose(tab.id)}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
