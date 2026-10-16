/**
 * The render model of one file in the right panel's viewer.
 *
 * The viewer draws a breadcrumb, a toolbar and one of two content modes
 * (`docs/wireframes/23-file-viewer-markdown.html`,
 * `13-chat-with-editor.html`). Everything the two modes need — the crumb chain,
 * the label, whether the file is Markdown, the numbered source lines and the
 * mode it opens in — is derived here so the organism stays free of mapping
 * rules.
 */
import type { FileDocument } from '@/shared/domain/file-document.types';
import { breadcrumbSegments, fileName, fileExtension } from './file-path';

/**
 * `rendered` is the Markdown document the wireframe draws; `source` is the
 * numbered code view, used for code files and behind "Ver código fuente".
 */
export const FILE_VIEW_MODES = ['rendered', 'source'] as const;

export type FileViewMode = (typeof FILE_VIEW_MODES)[number];

/** Extensions the viewer renders as Markdown by default. */
const MARKDOWN_EXTENSIONS: readonly string[] = ['md', 'markdown'];

/** Whether a path opens in the rendered Markdown mode. */
export function isMarkdownPath(path: string): boolean {
  return MARKDOWN_EXTENSIONS.includes(fileExtension(path));
}

/**
 * Splits contents into the lines the source view numbers. A trailing newline
 * closes the last line instead of opening an empty one.
 */
export function splitLines(content: string): readonly string[] {
  if (content === '') {
    return [];
  }
  const lines = content.split('\n');
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

/** One document as the viewer draws it. */
export interface FileDocumentView {
  readonly path: string;
  /** Tab and viewer label: the file name. */
  readonly name: string;
  /** Workspace-relative segments, exactly the form the chip label uses. */
  readonly breadcrumb: readonly string[];
  readonly isMarkdown: boolean;
  /** Source lines, numbered from 1 by the source view. */
  readonly lines: readonly string[];
  /** Mode the document opens in when the user has not toggled it. */
  readonly defaultMode: FileViewMode;
}

/** Builds the viewer's render model from one document. */
export function buildFileDocumentView(
  document: FileDocument
): FileDocumentView {
  const isMarkdown = isMarkdownPath(document.path);

  return {
    path: document.path,
    name: fileName(document.path),
    breadcrumb: breadcrumbSegments(document.path),
    isMarkdown,
    lines: splitLines(document.content),
    defaultMode: isMarkdown ? 'rendered' : 'source'
  };
}
