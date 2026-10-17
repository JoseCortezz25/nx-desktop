import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getSharedMessages } from '@/shared/i18n/messages';
import { FilePanel } from './file-panel';

const DOC = 'docs/research-tecnico/arquitectura-tauri.md';

function renderPanel(
  openFileRequest: { path: string } | null,
  isOpen = true
): string {
  return renderToStaticMarkup(
    <FilePanel
      openFileRequest={openFileRequest}
      isOpen={isOpen}
      onClose={() => undefined}
    />
  );
}

describe('file panel', () => {
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
});
