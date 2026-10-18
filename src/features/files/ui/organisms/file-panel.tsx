import { useState } from 'react';
import { SubagentsViewer } from '@/features/subagents/ui/organisms/subagents-viewer';
import type { SubagentId } from '@/shared/domain/value-objects.types';
import { DiffView } from '@/features/diff/ui/organisms/diff-view';
import type { OpenFileRequest } from '@/shared/domain/file-reference.types';
import { getSharedMessages } from '@/shared/i18n/messages';
import { RightPanel } from '@/shared/ui/organisms/right-panel';
import {
  activeFileTab,
  closeFileTab,
  focusFileTab,
  INITIAL_FILE_TABS,
  openFileTab,
  openChangesTab,
  openSubagentsTab,
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
  /**
   * How many times the conversation has asked for the change set (#13). A new
   * count opens or refocuses the single `Cambios` tab; the counter is the shell's,
   * so the panel never keeps a second copy of that decision.
   */
  readonly openChangesRequestCount: number;
  /** New requests open or refocus the subagents tab and its requested child. */
  readonly openSubagentsRequestCount?: number;
  readonly openSubagentsRequestSubagentId?: SubagentId | null;
  /**
   * Whether the region is visible. Region visibility is owned by the shell; the
   * panel only reflects it. It is a presentation toggle (`hidden`) rather than
   * an unmount, so the open-tab set below survives a close/reopen.
   */
  readonly isOpen: boolean;
  /**
   * Whether the region is drawn as an overlay over the main pane instead of a
   * fixed column (#43, narrow windows). It is a presentation mode resolved by
   * the shell from the window width; the panel's tab working set is untouched by
   * it, so an overlay/column switch never discards open tabs.
   */
  readonly isOverlay: boolean;
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
 *
 * The shell keeps this organism mounted while the region is hidden (`isOpen`),
 * so the tab set it owns outlives a close/reopen instead of collapsing back to
 * the single last-requested file.
 */
export function FilePanel({
  openFileRequest,
  openChangesRequestCount,
  openSubagentsRequestCount = 0,
  openSubagentsRequestSubagentId = null,
  isOpen,
  isOverlay,
  onClose
}: FilePanelProps) {
  const messages = getSharedMessages();
  const [tabs, setTabs] = useState<FileTabs>(() =>
    openFileRequest
      ? openFileTab(INITIAL_FILE_TABS, openFileRequest.path)
      : INITIAL_FILE_TABS
  );
  const [handledRequest, setHandledRequest] = useState(openFileRequest);
  // The panel has handled no changes request yet, which is also the shell's
  // starting count: a prop that already counts one (a request that happened
  // before this panel mounted) is therefore reconciled on the first render.
  const [handledChangesRequestCount, setHandledChangesRequestCount] =
    useState(0);

  const [handledSubagentsRequestCount, setHandledSubagentsRequestCount] =
    useState(0);

  // Same render-phase reconciliation as the file request above: a new count opens
  // or refocuses the `Cambios` tab in the same commit that carries it. The count
  // is monotonic, so two presses focus the one tab that exists.
  if (openChangesRequestCount !== handledChangesRequestCount) {
    setHandledChangesRequestCount(openChangesRequestCount);
    setTabs(current => openChangesTab(current, messages.diff.panelTabLabel));
  }

  if (openSubagentsRequestCount !== handledSubagentsRequestCount) {
    setHandledSubagentsRequestCount(openSubagentsRequestCount);
    setTabs(current =>
      openSubagentsTab(current, messages.subagents.panelTabLabel)
    );
  }

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
      isOpen={isOpen}
      isOverlay={isOverlay}
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
      {activeTab?.kind === 'changes' ? (
        <DiffView />
      ) : activeTab?.kind === 'subagents' ? (
        <SubagentsViewer
          focusRequestCount={openSubagentsRequestCount}
          focusedSubagentId={openSubagentsRequestSubagentId}
        />
      ) : activeTab ? (
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
