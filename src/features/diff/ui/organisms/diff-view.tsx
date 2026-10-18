import { useState } from 'react';
import { getSharedMessages } from '@/shared/i18n/messages';
import { useWorkspaceDiff } from '../../hooks/use-workspace-diff';
import {
  INITIAL_COLLAPSED_SECTIONS,
  isDiffEmpty,
  summarizeDiff,
  toggleDiffSection,
  type CollapsedDiffSections
} from '../../model/diff-view';
import { DiffFileSection } from '../molecules/diff-file-section';
import './diff-view.css';

/**
 * Organism: the workspace's change set in the right panel — a summary bar and one
 * collapsible section per changed file with its unified hunks
 * (`docs/wireframes/18-chat-with-diff.html`; screen 18, "Reusable components").
 *
 * It resolves the change set through the diff port (`useWorkspaceDiff`) and owns
 * the only piece of state the surface needs: which sections are collapsed. Every
 * section starts expanded, so the first paint shows the whole change set instead
 * of hiding it behind a disclosure the user did not ask for.
 *
 * `split` mode and the wireframe's `Vista dividida` / `Vista unificada` toggle are
 * deliberately absent: the locked decision leaves `unified` only
 * (`.claude/knowledge/business-logic.md` §3.5 item 1). The summary bar's
 * workspace name is the active project's and belongs to the project surface
 * (#8), so this bar prints the count and the totals it can stand behind.
 */
export function DiffView() {
  const messages = getSharedMessages();
  const { files, isLoading } = useWorkspaceDiff();
  const [collapsed, setCollapsed] = useState<CollapsedDiffSections>(
    INITIAL_COLLAPSED_SECTIONS
  );

  const summary = summarizeDiff(files ?? []);

  function handleToggle(path: string) {
    setCollapsed(current => toggleDiffSection(current, path));
  }

  return (
    <section className="diff-view" aria-label={messages.diff.listLabel}>
      <div className="diff-view__summary">
        <span className="diff-view__count">
          {messages.diff.summary.fileCount(summary.fileCount)}
        </span>
        <span
          className="diff-view__added"
          role="img"
          aria-label={messages.diff.summary.addedLabel(summary.added)}
        >
          {`+${summary.added}`}
        </span>
        <span
          className="diff-view__removed"
          role="img"
          aria-label={messages.diff.summary.removedLabel(summary.removed)}
        >
          {`-${summary.removed}`}
        </span>
      </div>

      {files === null ? (
        <p className="diff-view__notice">
          {isLoading ? messages.diff.loadingLabel : messages.diff.emptyLabel}
        </p>
      ) : isDiffEmpty(files) ? (
        <p className="diff-view__notice">{messages.diff.emptyLabel}</p>
      ) : (
        <div className="diff-view__sections">
          {files.map(file => (
            <DiffFileSection
              key={file.path}
              file={file}
              isCollapsed={collapsed.has(file.path)}
              onToggle={() => handleToggle(file.path)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
