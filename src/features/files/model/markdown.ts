/**
 * Minimal Markdown parser for the right panel's rendered view.
 *
 * Screen 23 renders Markdown, and the app owns its copy of that rendering
 * instead of pulling a Markdown dependency: `.claude/knowledge/critical-constraints.md`
 * §7 requires rendered Markdown to be sanitized, and a parser that produces
 * plain text spans for React to escape is safer than an HTML pipeline that would
 * need a sanitizer. The subset below covers everything the wireframe draws
 * (headings, paragraphs, ordered and unordered lists, inline code, code fences,
 * links, quotes and rules) and anything outside it degrades to escaped text
 * rather than disappearing.
 *
 * No block or inline carries raw HTML: the renderer never sets inner HTML, so
 * agent or file content cannot inject markup.
 */

export const MARKDOWN_INLINE_KINDS = [
  'text',
  'code',
  'strong',
  'emphasis',
  'link'
] as const;

export type MarkdownInlineKind = (typeof MARKDOWN_INLINE_KINDS)[number];

/** One inline run of a block's text. */
export interface MarkdownInline {
  readonly kind: MarkdownInlineKind;
  readonly text: string;
  /** Set on `link` runs only; links with an unsafe scheme degrade to text. */
  readonly href?: string;
}

export interface MarkdownHeading {
  readonly kind: 'heading';
  /** Heading level, 1 through 6. */
  readonly level: number;
  readonly inlines: readonly MarkdownInline[];
}

export interface MarkdownParagraph {
  readonly kind: 'paragraph';
  readonly inlines: readonly MarkdownInline[];
}

export interface MarkdownQuote {
  readonly kind: 'quote';
  readonly inlines: readonly MarkdownInline[];
}

export interface MarkdownList {
  readonly kind: 'list';
  readonly isOrdered: boolean;
  readonly items: readonly (readonly MarkdownInline[])[];
}

export interface MarkdownCode {
  readonly kind: 'code';
  /** Fence language, or `''` when the fence carries none. */
  readonly language: string;
  readonly lines: readonly string[];
}

export interface MarkdownRule {
  readonly kind: 'rule';
}

/** One block of the rendered document. */
export type MarkdownBlock =
  | MarkdownHeading
  | MarkdownParagraph
  | MarkdownQuote
  | MarkdownList
  | MarkdownCode
  | MarkdownRule;

const HEADING = /^(#{1,6})\s+(.*)$/;
const UNORDERED_ITEM = /^[-*]\s+(.*)$/;
const ORDERED_ITEM = /^\d+[.)]\s+(.*)$/;
const RULE = /^(?:-{3,}|\*{3,}|_{3,})$/;
const QUOTE = /^>\s?(.*)$/;
const FENCE = /^```([A-Za-z0-9#+._-]*)\s*$/;
const INLINE_CODE = /^`([^`]+)`/;
const INLINE_LINK = /^\[([^\]]+)\]\(([^)\s]+)\)/;
const INLINE_STRONG = /^\*\*([^*]+)\*\*/;
const INLINE_EMPHASIS = /^\*([^*]+)\*/;

/**
 * Schemes and forms the rendered links may use. `javascript:` and `data:` URLs
 * are rejected so a document cannot smuggle executable links into the webview.
 */
const SAFE_HREF = /^(?:https?:|mailto:|#|\/|\.{1,2}\/)/i;

/** Whether a link target may be rendered as a link. */
export function isSafeHref(href: string): boolean {
  return SAFE_HREF.test(href.trim());
}

/** Splits one line of text into code, link, strong, emphasis and text runs. */
export function parseInlines(text: string): readonly MarkdownInline[] {
  const inlines: MarkdownInline[] = [];
  let buffer = '';
  let rest = text;

  const flush = () => {
    if (buffer.length > 0) {
      inlines.push({ kind: 'text', text: buffer });
      buffer = '';
    }
  };

  while (rest.length > 0) {
    const code = INLINE_CODE.exec(rest);
    if (code) {
      flush();
      inlines.push({ kind: 'code', text: code[1] ?? '' });
      rest = rest.slice(code[0].length);
      continue;
    }

    const link = INLINE_LINK.exec(rest);
    if (link) {
      flush();
      const href = link[2] ?? '';
      const label = link[1] ?? '';
      inlines.push(
        isSafeHref(href)
          ? { kind: 'link', text: label, href }
          : { kind: 'text', text: label }
      );
      rest = rest.slice(link[0].length);
      continue;
    }

    const strong = INLINE_STRONG.exec(rest);
    if (strong) {
      flush();
      inlines.push({ kind: 'strong', text: strong[1] ?? '' });
      rest = rest.slice(strong[0].length);
      continue;
    }

    const emphasis = INLINE_EMPHASIS.exec(rest);
    if (emphasis) {
      flush();
      inlines.push({ kind: 'emphasis', text: emphasis[1] ?? '' });
      rest = rest.slice(emphasis[0].length);
      continue;
    }

    buffer += rest.charAt(0);
    rest = rest.slice(1);
  }

  flush();
  return inlines;
}

/** Whether a trimmed line opens a block other than a paragraph. */
function opensBlock(line: string): boolean {
  return (
    HEADING.test(line) ||
    FENCE.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    UNORDERED_ITEM.test(line) ||
    ORDERED_ITEM.test(line)
  );
}

/** Parses Markdown into the plain blocks the rendered view draws. */
export function parseMarkdown(source: string): readonly MarkdownBlock[] {
  const lines = source.split('\n');
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = (lines[index] ?? '').trim();

    if (line === '') {
      index += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const language = fence[1] ?? '';
      const codeLines: string[] = [];
      index += 1;
      while (
        index < lines.length &&
        !(lines[index] ?? '').trim().startsWith('```')
      ) {
        codeLines.push(lines[index] ?? '');
        index += 1;
      }
      // Skip the closing fence; a fence left open still yields its code.
      index += 1;
      blocks.push({ kind: 'code', language, lines: codeLines });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        kind: 'heading',
        level: (heading[1] ?? '#').length,
        inlines: parseInlines(heading[2] ?? '')
      });
      index += 1;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ kind: 'rule' });
      index += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const quoted = QUOTE.exec((lines[index] ?? '').trim());
        if (!quoted) {
          break;
        }
        quoteLines.push(quoted[1] ?? '');
        index += 1;
      }
      blocks.push({
        kind: 'quote',
        inlines: parseInlines(quoteLines.join(' '))
      });
      continue;
    }

    const isOrdered = ORDERED_ITEM.test(line);
    if (isOrdered || UNORDERED_ITEM.test(line)) {
      const items: MarkdownInline[][] = [];
      while (index < lines.length) {
        const current = (lines[index] ?? '').trim();
        const match = isOrdered
          ? ORDERED_ITEM.exec(current)
          : UNORDERED_ITEM.exec(current);
        if (!match) {
          break;
        }
        items.push([...parseInlines(match[1] ?? '')]);
        index += 1;
      }
      blocks.push({ kind: 'list', isOrdered, items });
      continue;
    }

    const paragraphLines: string[] = [line];
    index += 1;
    while (index < lines.length) {
      const next = (lines[index] ?? '').trim();
      if (next === '' || opensBlock(next)) {
        break;
      }
      paragraphLines.push(next);
      index += 1;
    }
    blocks.push({
      kind: 'paragraph',
      inlines: parseInlines(paragraphLines.join(' '))
    });
  }

  return blocks;
}
