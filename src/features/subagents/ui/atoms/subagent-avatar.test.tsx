import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SubagentAvatar } from './subagent-avatar';

describe('subagent avatar', () => {
  it('draws a known variant with its keyed shape class', () => {
    const globe = renderToStaticMarkup(
      <SubagentAvatar variant="globe" label="Inspect repo" />
    );

    expect(globe).toContain('subagent-avatar--globe');
    expect(globe).toContain('<svg');
  });

  it('falls back to the default shape when the variant is unknown', () => {
    // The avatar key is sampled data, so a variant the presentation layer does
    // not know is a decorative gap, never a crash: the generic circle draws and
    // the unknown string is never interpolated into a class name.
    const fallback = renderToStaticMarkup(
      <SubagentAvatar variant="spark" label="Fallback avatar" />
    );

    expect(fallback).toContain('subagent-avatar--default');
    expect(fallback).not.toContain('spark');
  });

  it('keeps the accessible name on the decorative figure', () => {
    const markup = renderToStaticMarkup(
      <SubagentAvatar variant="globe" label="Inspect repo" />
    );

    expect(markup).toContain('aria-label="Inspect repo"');
  });
});
