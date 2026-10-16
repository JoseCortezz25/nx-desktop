import { describe, expect, it } from 'vitest';
import { breadcrumbSegments, fileExtension, fileName } from './file-path';

describe('workspace path helpers', () => {
  it('takes the final segment as the file name', () => {
    expect(fileName('docs/research-tecnico/arquitectura-tauri.md')).toBe(
      'arquitectura-tauri.md'
    );
    expect(fileName('README.md')).toBe('README.md');
  });

  it('ignores empty segments from leading, trailing or doubled separators', () => {
    expect(fileName('/src/App.tsx/')).toBe('App.tsx');
    expect(fileName('src//App.tsx')).toBe('App.tsx');
  });

  it('lower-cases the extension and reports none for dotfiles', () => {
    expect(fileExtension('src/App.TSX')).toBe('tsx');
    expect(fileExtension('docs/research-tecnico/arquitectura-tauri.md')).toBe(
      'md'
    );
    expect(fileExtension('.gitignore')).toBe('');
    expect(fileExtension('Makefile')).toBe('');
  });

  it('splits the path into the breadcrumb crumb chain', () => {
    expect(
      breadcrumbSegments('docs/research-tecnico/arquitectura-tauri.md')
    ).toEqual(['docs', 'research-tecnico', 'arquitectura-tauri.md']);
    expect(breadcrumbSegments('src/App.tsx')).toEqual(['src', 'App.tsx']);
  });
});
