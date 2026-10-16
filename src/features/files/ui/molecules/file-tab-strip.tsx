import { getSharedMessages } from '@/shared/i18n/messages';
import { Button } from '@/shared/ui/atoms/button';
import { Icon } from '@/shared/ui/atoms/icon';
import { IconButton } from '@/shared/ui/molecules/icon-button';
import type { FileTab } from '../../model/file-tabs';
import './file-tab-strip.css';

export interface FileTabStripProps {
  /** The files the panel has open, in the order they were opened. */
  readonly tabs: readonly FileTab[];
  /** The focused tab, or `null` while nothing is open. */
  readonly activeTabId: string | null;
  readonly onActivate: (tabId: string) => void;
  readonly onClose: (tabId: string) => void;
}

/**
 * Molecule: the right panel's file tab strip
 * (`docs/wireframes/23-file-viewer-markdown.html`, `.main .tabs`; screen 13). One
 * tab per opened file, each with its own close control. It owns no state: the
 * panel owns which tabs exist and which one is focused, so the strip can never
 * disagree with the viewer underneath it.
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
              label={tab.path}
              onPress={() => onActivate(tab.id)}
            >
              <Icon name="file" size="sm" />
              <span className="file-tab-strip__name">{tab.name}</span>
            </Button>
            <IconButton
              icon="close"
              size="sm"
              label={messages.fileViewer.tabs.closeLabel(tab.name)}
              onPress={() => onClose(tab.id)}
            />
          </div>
        );
      })}
    </div>
  );
}
