import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Composer } from './composer';

/**
 * Smokes the composition the unit tests cannot: that the organism renders the
 * prompt field, the add trigger, and the send control, and that the placeholder
 * comes from the active provider rather than a baked-in wireframe name. Static
 * rendering keeps this DOM-free, matching the node test environment.
 */
describe('composer', () => {
  it('renders the prompt field, the add trigger and the send control', () => {
    const markup = renderToStaticMarkup(
      <Composer providerName="OpenCode" onSubmit={() => undefined} />
    );

    expect(markup).toContain('class="composer"');
    expect(markup).toContain('class="composer-bar"');
    expect(markup).toContain('aria-label="Mensaje"');
    expect(markup).toContain('aria-label="Añadir"');
    expect(markup).toContain('aria-label="Enviar"');
  });

  it('derives the placeholder from the active provider', () => {
    const opencode = renderToStaticMarkup(
      <Composer providerName="OpenCode" onSubmit={() => undefined} />
    );
    const claude = renderToStaticMarkup(
      <Composer providerName="Claude" onSubmit={() => undefined} />
    );

    expect(opencode).toContain('placeholder="Trabaja con OpenCode"');
    expect(claude).toContain('placeholder="Trabaja con Claude"');
    expect(claude).not.toContain('Trabaja con OpenCode');
  });

  it('draws no placeholder while the provider catalog is loading', () => {
    const markup = renderToStaticMarkup(
      <Composer providerName={null} onSubmit={() => undefined} />
    );

    expect(markup).not.toContain('placeholder=');
  });
});
