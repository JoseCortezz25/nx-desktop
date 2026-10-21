import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DiffFile } from '@/shared/domain/diff-file.types';
import { getSharedMessages } from '@/shared/i18n/messages';
import { DiffFileSection } from './diff-file-section';

const FILE: DiffFile = {
  path: 'src/App.tsx',
  addedCount: 9,
  removedCount: 4,
  hunks: [
    {
      header: '@@ -6,2 +6,3 @@ function App()',
      lines: [
        { kind: 'context', content: 'function App() {' },
        { kind: 'removed', content: 'old line' },
        { kind: 'added', content: 'new line' }
      ]
    }
  ]
};

function renderSection(isCollapsed: boolean): string {
  return renderToStaticMarkup(
    <DiffFileSection
      file={FILE}
      isCollapsed={isCollapsed}
      onToggle={() => undefined}
    />
  );
}

describe('diff file section', () => {
  it('heads the section with the path and both counts', () => {
    const markup = renderSection(false);

    expect(markup).toContain('src/App.tsx');
    expect(markup).toMatch(/diff-file-section__added"[^>]*>\+9</);
    expect(markup).toMatch(/diff-file-section__removed"[^>]*>-4</);
  });

  it('expands to the hunk table and marks the header as expanded', () => {
    const markup = renderSection(false);

    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain(FILE.hunks[0].header);
    expect(markup).toContain('new line');
  });

  it('collapses to the header alone and marks it collapsed', () => {
    const markup = renderSection(true);

    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('src/App.tsx');
    expect(markup).toMatch(/diff-file-section__added"[^>]*>\+9</);
    expect(markup).not.toContain(FILE.hunks[0].header);
    expect(markup).not.toContain('new line');
  });

  it('states why a file without hunks has no table', () => {
    const messages = getSharedMessages();
    const binary: DiffFile = {
      path: 'assets/logo.png',
      addedCount: 0,
      removedCount: 0,
      hunks: [],
      notice: 'binary'
    };
    const markup = renderToStaticMarkup(
      <DiffFileSection
        file={binary}
        isCollapsed={false}
        onToggle={() => undefined}
      />
    );

    expect(markup).toContain('assets/logo.png');
    expect(markup).toContain(messages.diff.section.noticeLabel('binary'));
    expect(markup).not.toContain('diff-file-section__hunks');

    const collapsed = renderToStaticMarkup(
      <DiffFileSection file={binary} isCollapsed onToggle={() => undefined} />
    );
    expect(collapsed).not.toContain(
      messages.diff.section.noticeLabel('binary')
    );
  });

  it('names the disclosure for the file it opens', () => {
    const messages = getSharedMessages();

    expect(renderSection(false)).toContain(
      messages.diff.section.collapseLabel('src/App.tsx')
    );
    expect(renderSection(true)).toContain(
      messages.diff.section.expandLabel('src/App.tsx')
    );
  });
});
