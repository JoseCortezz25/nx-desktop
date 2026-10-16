import { describe, expect, it } from 'vitest';
import type { FileDocument } from '@/shared/domain/file-document.types';
import {
  buildFileDocumentView,
  isMarkdownPath,
  splitLines
} from './file-document-view';

describe('file document view', () => {
  it('opens Markdown in the rendered mode', () => {
    const document: FileDocument = {
      path: 'docs/research-tecnico/arquitectura-tauri.md',
      content: '# Título'
    };

    const view = buildFileDocumentView(document);

    expect(view.isMarkdown).toBe(true);
    expect(view.defaultMode).toBe('rendered');
    expect(view.name).toBe('arquitectura-tauri.md');
    expect(view.breadcrumb).toEqual([
      'docs',
      'research-tecnico',
      'arquitectura-tauri.md'
    ]);
  });

  it('opens every other file in the numbered source mode', () => {
    const document: FileDocument = {
      path: 'src/App.tsx',
      content: 'const one = 1;'
    };

    const view = buildFileDocumentView(document);

    expect(view.isMarkdown).toBe(false);
    expect(view.defaultMode).toBe('source');
    expect(view.lines).toEqual(['const one = 1;']);
  });

  it('recognizes Markdown by extension only', () => {
    expect(isMarkdownPath('README.md')).toBe(true);
    expect(isMarkdownPath('docs/notes.MARKDOWN')).toBe(true);
    expect(isMarkdownPath('src/App.tsx')).toBe(false);
    expect(isMarkdownPath('.gitignore')).toBe(false);
  });

  it('numbers every source line and ignores the trailing newline', () => {
    expect(splitLines('a\nb\nc\n')).toEqual(['a', 'b', 'c']);
    expect(splitLines('a\n\nb')).toEqual(['a', '', 'b']);
    expect(splitLines('')).toEqual([]);
  });
});
