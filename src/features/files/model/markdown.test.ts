import { describe, expect, it } from 'vitest';
import { isSafeHref, parseInlines, parseMarkdown } from './markdown';

describe('markdown parser', () => {
  it('parses the blocks the wireframe draws', () => {
    const source = [
      '# Título',
      '',
      'Un párrafo con `código` y un [enlace](#indice).',
      '',
      '## Lista',
      '',
      '1. Primero',
      '2. Segundo',
      '',
      '- Punto',
      '',
      '> Nota al margen',
      '',
      '---',
      '',
      '```ts',
      'const one = 1;',
      '```'
    ].join('\n');

    const blocks = parseMarkdown(source);

    expect(blocks.map(block => block.kind)).toEqual([
      'heading',
      'paragraph',
      'heading',
      'list',
      'list',
      'quote',
      'rule',
      'code'
    ]);
    expect(blocks[0]).toEqual({
      kind: 'heading',
      level: 1,
      inlines: [{ kind: 'text', text: 'Título' }]
    });
    expect(blocks[3]).toEqual({
      kind: 'list',
      isOrdered: true,
      items: [
        [{ kind: 'text', text: 'Primero' }],
        [{ kind: 'text', text: 'Segundo' }]
      ]
    });
    expect(blocks[4]).toEqual({
      kind: 'list',
      isOrdered: false,
      items: [[{ kind: 'text', text: 'Punto' }]]
    });
    expect(blocks[7]).toEqual({
      kind: 'code',
      language: 'ts',
      lines: ['const one = 1;']
    });
  });

  it('joins wrapped paragraph lines and never creates raw HTML', () => {
    const blocks = parseMarkdown('<b>no html</b>\ncontinúa aquí');

    expect(blocks).toEqual([
      {
        kind: 'paragraph',
        inlines: [{ kind: 'text', text: '<b>no html</b> continúa aquí' }]
      }
    ]);
  });

  it('parses inline code, links, strong and emphasis runs', () => {
    expect(parseInlines('a `b` [c](#d) **e** *f*')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'code', text: 'b' },
      { kind: 'text', text: ' ' },
      { kind: 'link', text: 'c', href: '#d' },
      { kind: 'text', text: ' ' },
      { kind: 'strong', text: 'e' },
      { kind: 'text', text: ' ' },
      { kind: 'emphasis', text: 'f' }
    ]);
  });

  it('degrades an unsafe link scheme to plain text', () => {
    expect(parseInlines('[x](javascript:void)')).toEqual([
      { kind: 'text', text: 'x' }
    ]);
    // A target whose scheme hides a parenthesis never matches the link form at
    // all, so the whole thing stays text: the parser fails closed.
    expect(parseInlines('[x](javascript:alert(1))')).toEqual([
      { kind: 'text', text: 'x' },
      { kind: 'text', text: ')' }
    ]);
    expect(isSafeHref('javascript:alert(1)')).toBe(false);
    expect(isSafeHref('data:text/html,x')).toBe(false);
    expect(isSafeHref('https://tauri.app')).toBe(true);
    expect(isSafeHref('#indice')).toBe(true);
  });

  it('keeps an unclosed fence as code and ignores blank lines', () => {
    expect(parseMarkdown('\n\n```\nlet a = 1;')).toEqual([
      { kind: 'code', language: '', lines: ['let a = 1;'] }
    ]);
  });
});
