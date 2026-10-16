import { Fragment } from 'react';
import type { MarkdownBlock, MarkdownInline } from '../../model/markdown';
import './markdown-document.css';

export interface MarkdownDocumentProps {
  /** Blocks produced by `parseMarkdown`; the molecule never parses text itself. */
  readonly blocks: readonly MarkdownBlock[];
  /** Accessible name: the workspace-relative path being drawn. */
  readonly label: string;
}

/**
 * Molecule: the rendered Markdown content of the file viewer
 * (`docs/wireframes/23-file-viewer-markdown.html`, `.doc`). It draws the plain
 * blocks the parser produced and every run of text as escaped React text — no
 * inner HTML — so file content can never inject markup into the webview
 * (`.claude/knowledge/critical-constraints.md` §7).
 */
export function MarkdownDocument({ blocks, label }: MarkdownDocumentProps) {
  return (
    <article className="markdown-document" aria-label={label}>
      {blocks.map((block, index) => (
        <Fragment key={index}>{renderBlock(block)}</Fragment>
      ))}
    </article>
  );
}

function renderBlock(block: MarkdownBlock) {
  switch (block.kind) {
    case 'heading': {
      const level = Math.min(Math.max(block.level, 1), 6);
      const Heading = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      return (
        <Heading className="markdown-document__heading">
          {renderInlines(block.inlines)}
        </Heading>
      );
    }
    case 'paragraph':
      return (
        <p className="markdown-document__paragraph">
          {renderInlines(block.inlines)}
        </p>
      );
    case 'quote':
      return (
        <blockquote className="markdown-document__quote">
          {renderInlines(block.inlines)}
        </blockquote>
      );
    case 'list': {
      const items = block.items.map((item, index) => (
        <li key={index} className="markdown-document__item">
          {renderInlines(item)}
        </li>
      ));
      return block.isOrdered ? (
        <ol className="markdown-document__list">{items}</ol>
      ) : (
        <ul className="markdown-document__list">{items}</ul>
      );
    }
    case 'code':
      return (
        <pre className="markdown-document__code">
          <code>{block.lines.join('\n')}</code>
        </pre>
      );
    case 'rule':
      return <hr className="markdown-document__rule" />;
  }
}

function renderInlines(inlines: readonly MarkdownInline[]) {
  return inlines.map((inline, index) => {
    switch (inline.kind) {
      case 'code':
        return (
          <code key={index} className="markdown-document__inline-code">
            {inline.text}
          </code>
        );
      case 'strong':
        return <strong key={index}>{inline.text}</strong>;
      case 'emphasis':
        return <em key={index}>{inline.text}</em>;
      case 'link':
        return (
          <a key={index} className="markdown-document__link" href={inline.href}>
            {inline.text}
          </a>
        );
      case 'text':
        return <Fragment key={index}>{inline.text}</Fragment>;
    }
  });
}
