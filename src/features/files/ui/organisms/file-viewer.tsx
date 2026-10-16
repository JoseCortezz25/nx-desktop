import { Fragment, useState } from 'react';
import { getSharedMessages } from '@/shared/i18n/messages';
import { Button } from '@/shared/ui/atoms/button';
import { IconButton } from '@/shared/ui/molecules/icon-button';
import { Popover } from '@/shared/ui/molecules/popover';
import { useFileDocument } from '../../hooks/use-file-document';
import { useOpenTargets } from '../../hooks/use-open-targets';
import {
  buildFileDocumentView,
  type FileViewMode
} from '../../model/file-document-view';
import { parseMarkdown } from '../../model/markdown';
import { buildOpenMenuItems } from '../../model/open-menu';
import { MarkdownDocument } from '../molecules/markdown-document';
import { OpenMenuList } from '../molecules/open-menu-list';
import { OpenWithMenu } from '../molecules/open-with-menu';
import './file-viewer.css';

export interface FileViewerProps {
  /** Workspace-relative path of the file the focused tab shows. */
  readonly path: string;
}

/**
 * Organism: one file in the right panel — breadcrumb, toolbar and content
 * (`docs/wireframes/README.md`, "Reusable components" — `FileViewer`; screens 03,
 * 13 and 23). It resolves the document and the machine's open targets through
 * their feature hooks, owns the two pieces of state the surface needs (the
 * content mode and whether the `Abrir` menu is open) and draws the rendered
 * Markdown or the numbered source view.
 *
 * The panel remounts it per file, so the mode and the menu never leak from one
 * file to the next.
 */
export function FileViewer({ path }: FileViewerProps) {
  const messages = getSharedMessages();
  const { document, isLoading } = useFileDocument(path);
  const { targets, openInTarget } = useOpenTargets();
  const [modeOverride, setModeOverride] = useState<FileViewMode | null>(null);
  const [isMenuExpanded, setIsMenuExpanded] = useState(false);
  const menuItems = buildOpenMenuItems(targets);

  if (!document) {
    return (
      <section className="file-viewer file-viewer--notice" aria-label={path}>
        <p className="file-viewer__notice">
          {isLoading
            ? messages.fileViewer.loadingLabel
            : messages.fileViewer.missingLabel}
        </p>
      </section>
    );
  }

  const view = buildFileDocumentView(document);
  // The default follows the document, so a Markdown file that resolves after the
  // first paint still opens rendered; only an explicit toggle overrides it.
  const mode = modeOverride ?? view.defaultMode;
  const isRendered = mode === 'rendered' && view.isMarkdown;

  const toggleLabel = isRendered
    ? messages.fileViewer.toolbar.viewSourceLabel
    : messages.fileViewer.toolbar.viewDocumentLabel;

  function handleToggleMode() {
    setModeOverride(mode === 'rendered' ? 'source' : 'rendered');
  }

  function handleToggleMenu() {
    setIsMenuExpanded(current => !current);
  }

  function handleSelectTarget(target: (typeof menuItems)[number]['target']) {
    // The stub action lives behind the open-target port; the panel only asks it
    // to open the file and closes the list.
    openInTarget(target, path);
    setIsMenuExpanded(false);
  }

  function handleOpenPrimary() {
    const primary = menuItems[0];
    if (primary) {
      openInTarget(primary.target, path);
    }
  }

  function handleCopyPath() {
    // Stub: clipboard access belongs to a later ticket. Nothing is written here.
  }

  function handleSearchInFile() {
    // Stub: in-file search belongs to a later ticket. No search surface is
    // created and no file is read again.
  }

  return (
    <section className="file-viewer" aria-label={view.path}>
      <header className="file-viewer__toolbar">
        <span
          className="file-viewer__breadcrumb"
          aria-label={messages.fileViewer.breadcrumbLabel}
        >
          {view.breadcrumb.map((segment, index) => (
            <Fragment key={index}>
              {index > 0 ? (
                <span className="file-viewer__separator" aria-hidden="true">
                  &gt;
                </span>
              ) : null}
              <span className="file-viewer__crumb">{segment}</span>
            </Fragment>
          ))}
        </span>

        <div className="file-viewer__actions">
          <IconButton
            icon="search"
            label={messages.fileViewer.toolbar.searchLabel}
            onPress={handleSearchInFile}
          />
          {view.isMarkdown ? (
            <Button
              variant="pill"
              label={toggleLabel}
              onPress={handleToggleMode}
            >
              <span className="file-viewer__action-label">{toggleLabel}</span>
            </Button>
          ) : null}
          <IconButton
            icon="copy"
            label={messages.fileViewer.toolbar.copyPathLabel}
            onPress={handleCopyPath}
          />
          <OpenWithMenu
            items={menuItems}
            isExpanded={isMenuExpanded}
            onOpenPrimary={handleOpenPrimary}
            onToggle={handleToggleMenu}
          />

          {isMenuExpanded && menuItems.length > 0 ? (
            <div className="file-viewer__menu">
              <Popover>
                <OpenMenuList items={menuItems} onSelect={handleSelectTarget} />
              </Popover>
            </div>
          ) : null}
        </div>
      </header>

      <div
        className="file-viewer__content"
        role="tabpanel"
        aria-label={view.path}
      >
        {isRendered ? (
          <MarkdownDocument
            blocks={parseMarkdown(document.content)}
            label={view.path}
          />
        ) : (
          <pre className="file-viewer__code">
            {view.lines.map((line, index) => (
              <span key={index} className="file-viewer__code-line">
                <span className="file-viewer__code-number" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="file-viewer__code-text">
                  {line === '' ? ' ' : line}
                </span>
              </span>
            ))}
          </pre>
        )}
      </div>
    </section>
  );
}
