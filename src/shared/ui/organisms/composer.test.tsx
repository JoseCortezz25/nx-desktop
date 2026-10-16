import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Provider } from '@/shared/domain/provider.types';
import { Composer } from './composer';

/**
 * Smokes the composition the unit tests cannot: that the organism renders the
 * prompt field, the add trigger, the send control, and the three selector chips
 * for the default selection. Static rendering keeps this DOM-free, matching the
 * node test environment; the selection chain itself is covered in
 * `selection-chain.test.ts` and `mock-provider-repository.test.ts`.
 */
const catalog: readonly Provider[] = [
  {
    id: 'alpha',
    displayName: 'Alpha',
    icon: 'alpha',
    subtitle: 'First provider',
    availableModels: [
      {
        id: 'alpha-one',
        displayName: 'Alpha One',
        providerId: 'alpha',
        supportedEffortLevels: ['light', 'standard']
      }
    ]
  },
  {
    id: 'beta',
    displayName: 'Beta',
    icon: 'beta',
    subtitle: 'Second provider',
    availableModels: [
      {
        id: 'beta-one',
        displayName: 'Beta One',
        providerId: 'beta',
        supportedEffortLevels: ['maximum']
      }
    ]
  }
];

describe('composer', () => {
  it('renders the prompt field, the add trigger and the send control', () => {
    const markup = renderToStaticMarkup(
      <Composer providers={catalog} onSubmit={() => undefined} />
    );

    expect(markup).toContain('class="composer"');
    expect(markup).toContain('class="composer-bar"');
    expect(markup).toContain('aria-label="Mensaje"');
    expect(markup).toContain('aria-label="Añadir"');
    expect(markup).toContain('aria-label="Enviar"');
  });

  it('derives the placeholder from the selected provider', () => {
    const markup = renderToStaticMarkup(
      <Composer providers={catalog} onSubmit={() => undefined} />
    );

    expect(markup).toContain('placeholder="Trabaja con Alpha"');
  });

  it('draws no placeholder while the provider catalog is loading', () => {
    const markup = renderToStaticMarkup(
      <Composer providers={[]} onSubmit={() => undefined} />
    );

    expect(markup).not.toContain('placeholder=');
  });

  it('renders the provider, model and effort chips for the default selection', () => {
    const markup = renderToStaticMarkup(
      <Composer providers={catalog} onSubmit={() => undefined} />
    );

    expect(markup).toContain('class="button button--pill"');
    expect(markup).toContain('aria-label="Proveedor: Alpha"');
    expect(markup).toContain('aria-label="Modelo: Alpha One"');
    expect(markup).toContain('aria-label="Esfuerzo: Ligero"');
  });

  it('names no wireframe placeholder provider or model', () => {
    const markup = renderToStaticMarkup(
      <Composer providers={catalog} onSubmit={() => undefined} />
    );

    expect(markup).not.toContain('ChatGPT');
    expect(markup).not.toContain('GPT-6.1 Sol');
  });
});
