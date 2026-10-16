import { useState } from 'react';
import type { OpenFileRequest } from '@/shared/domain/file-reference.types';
import { getSharedMessages } from '@/shared/i18n/messages';
import { RightPanel } from '@/shared/ui/organisms/right-panel';
import {
  activeFileTab,
  closeFileTab,
  focusFileTab,
  INITIAL_FILE_TABS,
  openFileTab,
  type FileTabs
} from '../../model/file-tabs';
import { FileTabStrip } from '../molecules/file-tab-strip';
import { FileViewer } from './file-viewer';
import './file-panel.css';

export interface FilePanelProps {
  /**
   * The file the window shell currently has requested, or `null`. The shell owns
   * it once; the panel reads that same value instead of keeping a second copy
   * (`.claude/knowledge/business-logic.md` §3.5; the seam #11 built).
   */
  readonly openFileRequest: OpenFileRequest | null;
  /** Closes the panel region; the shell owns region visibility. */
  readonly onClose: () => void;
}

/**
 * Organism: the right panel's file content — the tab strip and the viewer for
 * the focused tab (`docs/wireframes/README.md`, "Layout regions"). It is the
 * consumer of the shell's open-file request: a request opens the file's tab, or
 * focuses the tab the file already has, and it owns the tab strip state so the
 * strip and the viewer can never disagree.
 *
 * It composes the shared `RightPanel` frame, so the region chrome (and the
 * viewer slot later tickets fill) stays shared while the file behaviour lives
 * with the files feature.
 */
export function FilePanel({ openFileRequest, onClose }: FilePanelProps) {
  const messages = getSharedMessages();
  const [tabs, setTabs] = useState<FileTabs>(() =>
    openFileRequest
      ? openFileTab(INITIAL_FILE_TABS, openFileRequest.path)
      : INITIAL_FILE_TABS
  );
  const [handledRequest, setHandledRequest] = useState(openFileRequest);

  // The shell's request is reconciled during render rather than in an effect:
  // React re-runs this component immediately after a render-phase update, so a
  // chip click opens or focuses its tab in the same commit and the request is
  // never copied into a second piece of state.
  if (openFileRequest !== handledRequest) {
    setHandledRequest(openFileRequest);
    if (openFileRequest) {
      setTabs(current => openFileTab(current, openFileRequest.path));
    }
  }

  const activeTab = activeFileTab(tabs);

  function handleActivate(tabId: string) {
    setTabs(current => focusFileTab(current, tabId));
  }

  function handleCloseTab(tabId: string) {
    setTabs(current => closeFileTab(current, tabId));
  }

  return (
    <RightPanel
      onClose={onClose}
      tabs={
        <FileTabStrip
          tabs={tabs.tabs}
          activeTabId={tabs.activeTabId}
          onActivate={handleActivate}
          onClose={handleCloseTab}
        />
      }
    >
      {activeTab ? (
        <FileViewer key={activeTab.path} path={activeTab.path} />
      ) : (
        <div className="file-panel__empty">
          <p className="file-panel__empty-text">
            {messages.fileViewer.emptyLabel}
          </p>
        </div>
      )}
    </RightPanel>
  );
}
