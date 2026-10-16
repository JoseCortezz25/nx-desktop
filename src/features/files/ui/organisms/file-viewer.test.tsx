import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileDocument } from '@/shared/domain/file-document.types';
import type { OpenTargetAvailability } from '@/shared/domain/open-target.types';
import { getSharedMessages } from '@/shared/i18n/messages';
import { FileViewer } from './file-viewer';

/**
 * The viewer resolves its document and the machine's open targets through feature
 * hooks (async, no-op under static rendering). This harness replaces them so the
 * viewer's own rendering can be asserted: which content mode is drawn, whether
 * line numbers are present, and whether the `Abrir` control appears at all.
 */
const harness = vi.hoisted(() => ({
  document: null as FileDocument | null,
  isLoading: false,
  targets: [] as readonly OpenTargetAvailability[]
}));

vi.mock('@/features/files/hooks/use-file-document', () => ({
  useFileDocument: () => ({
    document: harness.document,
    isLoading: harness.isLoading
  })
}));

vi.mock('@/features/files/hooks/use-open-targets', () => ({
  useOpenTargets: () => ({
    targets: harness.targets,
    isLoading: false,
    openInTarget: () => undefined
  })
}));

const EDITOR_INSTALLED: readonly OpenTargetAvailability[] = [
  { target: 'editor', isInstalled: true },
  { target: 'reveal_in_file_manager', isInstalled: true }
];

const EDITOR_MISSING: readonly OpenTargetAvailability[] = [
  { target: 'editor', isInstalled: false },
  { target: 'reveal_in_file_manager', isInstalled: true }
];

function renderViewer(path: string): string {
  return renderToStaticMarkup(<FileViewer path={path} />);
}

describe('file viewer', () => {
  beforeEach(() => {
    harness.document = null;
    harness.isLoading = false;
    harness.targets = EDITOR_INSTALLED;
  });

  it('renders Markdown as a document, not as numbered source', () => {
    harness.document = {
      path: 'docs/research-tecnico/arquitectura-tauri.md',
      content:
        '# Diagnóstico y alcance\n\nUsa `readDocument` para leer el archivo.'
    };

    const markup = renderViewer('docs/research-tecnico/arquitectura-tauri.md');

    expect(markup).toContain('markdown-document');
    expect(markup).toContain('<h1 class="markdown-document__heading"');
    expect(markup).toContain('Diagnóstico y alcance');
    expect(markup).toContain('markdown-document__inline-code');
    expect(markup).not.toContain('file-viewer__code');
  });

  it('renders code with one line number per line', () => {
    harness.document = {
      path: 'src/App.tsx',
      content: 'const one = 1;\n\nconst three = 3;'
    };

    const markup = renderViewer('src/App.tsx');

    expect(markup).toContain('file-viewer__code');
    expect(markup).toContain('>1</span>');
    expect(markup).toContain('>2</span>');
    expect(markup).toContain('>3</span>');
    expect(markup).not.toContain('>4</span>');
    expect(markup).toContain('const three = 3;');
    expect(markup).not.toContain('markdown-document');
  });

  it('draws the workspace-relative breadcrumb the chip label follows', () => {
    harness.document = { path: 'src/App.tsx', content: 'const one = 1;' };

    const markup = renderViewer('src/App.tsx');
    const messages = getSharedMessages();

    expect(markup).toContain(
      `aria-label="${messages.fileViewer.breadcrumbLabel}"`
    );
    expect(markup).toContain('<span class="file-viewer__crumb">src</span>');
    expect(markup).toContain('<span class="file-viewer__crumb">App.tsx</span>');
    expect(markup).not.toContain('nx-desktop');
  });

  it('draws the toolbar actions from the shared copy', () => {
    harness.document = {
      path: 'docs/research-tecnico/arquitectura-tauri.md',
      content: '# Índice'
    };
    const messages = getSharedMessages();

    const markup = renderViewer('docs/research-tecnico/arquitectura-tauri.md');

    expect(markup).toContain(
      `aria-label="${messages.fileViewer.toolbar.searchLabel}"`
    );
    expect(markup).toContain(
      `aria-label="${messages.fileViewer.toolbar.copyPathLabel}"`
    );
    expect(markup).toContain(messages.fileViewer.toolbar.viewSourceLabel);
  });

  it('offers the VS Code entry while the machine reports it installed', () => {
    harness.document = { path: 'src/App.tsx', content: 'const one = 1;' };

    const markup = renderViewer('src/App.tsx');

    expect(markup).toContain('open-with-menu');
    expect(markup).toContain('Abrir');
  });

  it('hides the VS Code entry when the machine does not have it, offering no replacement', () => {
    harness.document = { path: 'src/App.tsx', content: 'const one = 1;' };
    harness.targets = EDITOR_MISSING;

    const markup = renderViewer('src/App.tsx');

    expect(markup).not.toContain('Abrir');
    expect(markup).not.toContain('open-with-menu');
    expect(markup).not.toContain('Explorador');
  });

  it('hides the source toggle for a code file, which is already source', () => {
    harness.document = { path: 'src/App.tsx', content: 'const one = 1;' };
    const messages = getSharedMessages();

    const markup = renderViewer('src/App.tsx');

    expect(markup).not.toContain(messages.fileViewer.toolbar.viewSourceLabel);
  });

  it('tells the reader a missing file could not be read', () => {
    harness.document = null;
    harness.isLoading = false;

    expect(renderViewer('src/missing.ts')).toContain(
      getSharedMessages().fileViewer.missingLabel
    );
  });

  it('tells the reader the file is still loading', () => {
    harness.document = null;
    harness.isLoading = true;

    expect(renderViewer('src/App.tsx')).toContain(
      getSharedMessages().fileViewer.loadingLabel
    );
  });
});
