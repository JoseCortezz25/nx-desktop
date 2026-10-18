import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DiffHunk } from '@/shared/domain/diff-file.types';
import { getSharedMessages } from '@/shared/i18n/messages';
import { DiffHunkTable } from './diff-hunk-table';

const HUNK: DiffHunk = {
  header: '@@ -6,2 +6,3 @@ function App()',
  lines: [
    { kind: 'context', content: 'function App() {' },
    {
      kind: 'removed',
      content: '  const [greetMsg, setGreetMsg] = useState("");'
    },
    {
      kind: 'added',
      content: '  const [provider, setProvider] = useState("x");'
    },
    { kind: 'added', content: '  const [model, setModel] = useState("y");' }
  ]
};

function renderTable(): string {
  return renderToStaticMarkup(<DiffHunkTable path="src/App.tsx" hunk={HUNK} />);
}

describe('diff hunk table', () => {
  it('draws the hunk header above its lines', () => {
    const markup = renderTable();

    expect(markup).toContain(HUNK.header);
    expect(markup).toContain('diff-hunk__header');
    expect(markup.indexOf(HUNK.header)).toBeLessThan(
      markup.indexOf('function App() {')
    );
  });

  it('gives each line kind its own row class and marker', () => {
    const markup = renderTable();

    expect(markup).toContain('diff-hunk__row--context');
    expect(markup).toContain('diff-hunk__row--removed');
    expect(markup).toContain('diff-hunk__row--added');
    expect(markup).toMatch(/diff-hunk__marker"[^>]*>-</);
    expect(markup).toMatch(/diff-hunk__marker"[^>]*>\+</);
  });

  it('prints both line-number gutters, empty on the opposite side', () => {
    const markup = renderTable();

    // Old numbers run 6, 7 on the context and the removed line; the new numbers
    // of those rows stay empty, exactly as the wireframe's two gutter columns.
    expect(markup.match(/diff-hunk__number/g)?.length).toBe(
      HUNK.lines.length * 2
    );
    expect(markup).toContain('aria-hidden="true">6<');
    expect(markup).toContain('aria-hidden="true">7<');
  });

  it('names the table after the file it belongs to', () => {
    const markup = renderTable();

    expect(markup).toContain(
      getSharedMessages().diff.hunk.tableLabel('src/App.tsx')
    );
  });
});
