import type { DiffFile } from '@/shared/domain/diff-file.types';
import { getSharedMessages } from '@/shared/i18n/messages';
import { Button } from '@/shared/ui/atoms/button';
import { Icon } from '@/shared/ui/atoms/icon';
import { DiffHunkTable } from './diff-hunk-table';
import './diff-file-section.css';

export interface DiffFileSectionProps {
  /** The changed file this section draws. */
  readonly file: DiffFile;
  /** Whether the hunks are hidden; the owner keeps the state. */
  readonly isCollapsed: boolean;
  /** Flips this section only; the owner decides what that means. */
  readonly onToggle: () => void;
}

/**
 * Molecule: one collapsible changed-file section
 * (`docs/wireframes/18-chat-with-diff.html`, `.filesec`; screen 18) — the
 * disclosure header with the file icon, its path and its `+N` / `-N` counts, and
 * the hunks underneath while it is expanded.
 *
 * It holds no state: `isCollapsed` and `onToggle` are controlled by `DiffView`, so
 * the collapsed set has exactly one owner and two sections can never disagree
 * about it. The counts come from the file itself; this molecule never recounts.
 */
export function DiffFileSection({
  file,
  isCollapsed,
  onToggle
}: DiffFileSectionProps) {
  const messages = getSharedMessages();
  const disclosureLabel = isCollapsed
    ? messages.diff.section.expandLabel(file.path)
    : messages.diff.section.collapseLabel(file.path);
  const countsLabel = messages.diff.section.countsLabel(
    file.addedCount,
    file.removedCount
  );

  return (
    <section
      className={`diff-file-section${
        isCollapsed ? ' diff-file-section--collapsed' : ''
      }`}
    >
      <div className="diff-file-section__header">
        <Button
          variant="plain"
          label={disclosureLabel}
          isExpanded={!isCollapsed}
          onPress={onToggle}
        >
          <Icon name="chevron-down" size="sm" />
          <Icon name="file" size="sm" />
          <span className="diff-file-section__path">{file.path}</span>
          <span
            className="diff-file-section__counts"
            role="img"
            aria-label={countsLabel}
          >
            <span className="diff-file-section__added">{`+${file.addedCount}`}</span>
            <span className="diff-file-section__removed">{`-${file.removedCount}`}</span>
          </span>
        </Button>
      </div>

      {isCollapsed ? null : file.notice ? (
        <p className="diff-file-section__notice">
          {messages.diff.section.noticeLabel(file.notice)}
        </p>
      ) : (
        <div className="diff-file-section__hunks">
          {file.hunks.map((hunk, index) => (
            <DiffHunkTable key={index} path={file.path} hunk={hunk} />
          ))}
        </div>
      )}
    </section>
  );
}
