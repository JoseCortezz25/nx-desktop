import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getSharedMessages } from '@/shared/i18n/messages';
import { FilePanel } from './file-panel';

const DOC = 'docs/research-tecnico/arquitectura-tauri.md';

function renderPanel(openFileRequest: { path: string } | null): string {
  return renderToStaticMarkup(
    <FilePanel openFileRequest={openFileRequest} onClose={() => undefined} />
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
});
