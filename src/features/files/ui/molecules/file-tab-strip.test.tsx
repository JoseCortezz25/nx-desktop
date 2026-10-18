import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getSharedMessages } from '@/shared/i18n/messages';
import type { PanelTab } from '../../model/file-tabs';
import { FileTabStrip } from './file-tab-strip';

const tabs: readonly PanelTab[] = [
  { kind: 'file', id: 'src/App.tsx', path: 'src/App.tsx', name: 'App.tsx' },
  {
    kind: 'file',
    id: 'docs/research-tecnico/arquitectura-tauri.md',
    path: 'docs/research-tecnico/arquitectura-tauri.md',
    name: 'arquitectura-tauri.md'
  }
];

function render(activeTabId: string | null): string {
  return renderToStaticMarkup(
    <FileTabStrip
      tabs={tabs}
      activeTabId={activeTabId}
      onActivate={() => undefined}
      onClose={() => undefined}
    />
  );
}

describe('file tab strip', () => {
  it('draws the changes tab with the git icon and no close control', () => {
    const markup = renderToStaticMarkup(
      <FileTabStrip
        tabs={[{ kind: 'changes', id: 'changes', name: 'Cambios' }]}
        activeTabId="changes"
        onActivate={() => undefined}
        onClose={() => undefined}
      />
    );
    expect(markup).toContain('Cambios');
    expect(markup).toContain('aria-selected="true"');
    expect(markup.match(/<button/g)).toHaveLength(1);
    expect(markup).not.toContain(
      getSharedMessages().fileViewer.tabs.closeLabel('Cambios')
    );
    expect(markup).toContain('M6 3v15');
  });

  it('marks exactly the focused tab as selected', () => {
    const markup = render('src/App.tsx');

    expect(markup.match(/aria-selected="true"/g)?.length).toBe(1);
    expect(markup.match(/file-tab-strip__tab--active/g)?.length).toBe(1);
    expect(markup).toContain('aria-label="src/App.tsx"');
  });

  it('draws a tab per open file inside the labelled tablist', () => {
    const markup = render('src/App.tsx');
    const messages = getSharedMessages();

    expect(markup).toContain(
      `aria-label="${messages.fileViewer.tabs.listLabel}"`
    );
    expect(markup).toContain('App.tsx');
    expect(markup).toContain('arquitectura-tauri.md');
    expect(markup.match(/role="tab"/g)?.length).toBe(2);
  });

  it('labels every close control from the shared copy', () => {
    const markup = render('src/App.tsx');
    const messages = getSharedMessages();

    expect(markup).toContain(
      `aria-label="${messages.fileViewer.tabs.closeLabel('App.tsx')}"`
    );
    expect(markup).toContain(
      `aria-label="${messages.fileViewer.tabs.closeLabel('arquitectura-tauri.md')}"`
    );
  });

  it('draws an empty strip when no file is open', () => {
    const markup = renderToStaticMarkup(
      <FileTabStrip
        tabs={[]}
        activeTabId={null}
        onActivate={() => undefined}
        onClose={() => undefined}
      />
    );

    expect(markup).not.toContain('file-tab-strip__tab');
  });
});
