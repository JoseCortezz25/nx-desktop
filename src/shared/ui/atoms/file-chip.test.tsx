import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FileChip } from './file-chip';

describe('file chip', () => {
  it('renders its path and accessible name', () => {
    const markup = renderToStaticMarkup(
      <FileChip
        path="src/App.tsx"
        label="Abrir src/App.tsx"
        onOpen={() => undefined}
      />
    );

    expect(markup).toContain('src/App.tsx');
    expect(markup).toContain('aria-label="Abrir src/App.tsx"');
    expect(markup).not.toContain('file-chip--active');
  });

  it('emits the pressed path up to its owner', () => {
    const onOpen = vi.fn();
    const element = FileChip({
      path: 'src/App.tsx',
      label: 'Abrir src/App.tsx',
      onOpen
    });

    element.props.onClick?.();

    expect(onOpen).toHaveBeenCalledWith('src/App.tsx');
  });

  it('marks the file whose request is active', () => {
    const markup = renderToStaticMarkup(
      <FileChip
        path="src/App.tsx"
        label="Abrir"
        isActive
        onOpen={() => undefined}
      />
    );

    expect(markup).toContain('file-chip--active');
  });
});
