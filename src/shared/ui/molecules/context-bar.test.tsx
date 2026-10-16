import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getSharedMessages } from '@/shared/i18n/messages';
import { ContextBar } from './context-bar';

describe('context bar', () => {
  it('draws the project and the environment the run executes in', () => {
    const markup = renderToStaticMarkup(
      <ContextBar
        projectName="Design system"
        environmentLabel="Este ordenador"
      />
    );

    expect(markup).toContain('class="context-bar"');
    expect(markup).toContain('aria-label="Proyecto: Design system"');
    expect(markup).toContain('aria-label="Entorno: Este ordenador"');
  });

  it('prompts for a project while none is active', () => {
    const markup = renderToStaticMarkup(
      <ContextBar projectName={null} environmentLabel="Este ordenador" />
    );

    expect(markup).toContain(
      `aria-label="${getSharedMessages().contextBar.project.emptyLabel}"`
    );
  });

  it('draws the label of a named environment instead of the local machine', () => {
    const markup = renderToStaticMarkup(
      <ContextBar projectName="Design system" environmentLabel="staging" />
    );

    expect(markup).toContain('aria-label="Entorno: staging"');
    expect(markup).not.toContain('Este ordenador');
  });

  it('reports each chip as expanded while its popover is open', () => {
    const markup = renderToStaticMarkup(
      <ContextBar
        projectName="Design system"
        environmentLabel="Este ordenador"
        isProjectExpanded
        isEnvironmentExpanded
      />
    );

    expect(markup.match(/aria-expanded="true"/g)?.length).toBe(2);
  });
});
