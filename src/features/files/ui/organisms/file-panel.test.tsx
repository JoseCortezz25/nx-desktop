import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getSharedMessages } from '@/shared/i18n/messages';
import { FilePanel } from './file-panel';

const DOC = 'docs/research-tecnico/arquitectura-tauri.md';

function renderPanel(
  openFileRequest: { path: string } | null,
  isOpen = true,
  isOverlay = false,
  openChangesRequestCount = 0
): string {
  return renderToStaticMarkup(
    <FilePanel
      openFileRequest={openFileRequest}
      openChangesRequestCount={openChangesRequestCount}
      isOpen={isOpen}
      isOverlay={isOverlay}
      onClose={() => undefined}
    />
  );
}

describe('file panel', () => {
  it('focuses Cambios and renders the diff surface for a changes request', () => {
    const markup = renderPanel({ path: DOC }, true, false, 1);
    expect(markup).toContain('Cambios');
    expect(markup).toContain('class="diff-view"');
    expect(markup).not.toContain('class="file-viewer"');
    expect(markup).toContain('arquitectura-tauri.md');
    expect(markup.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(renderPanel(null, false, true, 2)).toContain('class="diff-view"');
  });

  it('opens a tab for the file the shell requested', () => {
    const markup = renderPanel({ path: DOC });

    expect(markup).toContain('class="right-panel"');
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('arquitectura-tauri.md');
    expect(markup).toContain('aria-selected="true"');
    expect(markup.match(/file-tab-strip__tab--active/g)?.length).toBe(1);
  });

  it('draws the empty state while no file is open', () => {
    const markup = renderPanel(null);

    expect(markup).toContain(getSharedMessages().fileViewer.emptyLabel);
    expect(markup).not.toContain('file-tab-strip__tab');
    expect(markup).not.toContain('file-viewer');
  });

  it('keeps the open-tab working set rendered while the region is hidden', () => {
    const markup = renderPanel({ path: DOC }, false);

    // A closed region is hidden (`hidden`, out of layout and the accessibility
    // tree) but its content is still rendered: the tab strip and the tab are in
    // the markup, so the shell's decision to keep the organism mounted is what
    // lets the working set outlive a close/reopen (#40, criterion 5).
    expect(markup).toContain('class="right-panel"');
    expect(markup).toContain('hidden=""');
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('arquitectura-tauri.md');
  });

  it('shows the region when the shell opens it and hides it when closed', () => {
    expect(renderPanel({ path: DOC }, true)).not.toContain('hidden=""');
    expect(renderPanel({ path: DOC }, false)).toContain('hidden=""');
  });

  it('re-frames the region as a dismissible overlay without losing open tabs (#43)', () => {
    const markup = renderPanel({ path: DOC }, true, true);

    // Same mounted region — the open tab survives — with the overlay frame and
    // the focus target the drawer needs.
    expect(markup).toContain('class="right-panel right-panel--overlay"');
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain('arquitectura-tauri.md');
  });

  it('keeps the plain column frame at wide widths (#43)', () => {
    const markup = renderPanel({ path: DOC }, true, false);

    expect(markup).toContain('class="right-panel"');
    expect(markup).not.toContain('right-panel--overlay');
    expect(markup).not.toContain('tabindex="-1"');
  });
});
