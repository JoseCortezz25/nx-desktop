import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Project } from '@/shared/domain/project.types';
import { getSharedMessages } from '@/shared/i18n/messages';
import { ProjectPicker } from './project-picker';

const projects: readonly Project[] = [
  {
    id: 'proj-one',
    name: 'Design system',
    workspaceFolders: ['/workspace/design-system'],
    approvalMode: 'ask_always',
    hookDecisions: [],
    conversationIds: []
  },
  {
    id: 'proj-two',
    name: 'API client',
    workspaceFolders: ['/workspace/api-client'],
    approvalMode: 'auto_approve',
    hookDecisions: [],
    conversationIds: []
  }
];

describe('project picker', () => {
  it('lists every project it is handed, through the port', () => {
    const markup = renderToStaticMarkup(
      <ProjectPicker
        label="Proyectos"
        projects={projects}
        selectedId="proj-two"
        onSelect={() => undefined}
      />
    );

    for (const project of projects) {
      expect(markup).toContain(`aria-label="${project.name}"`);
    }
    expect(markup.match(/role="option"/g)?.length).toBe(projects.length);
    expect(markup.match(/aria-selected="true"/g)?.length).toBe(1);
    expect(markup).toContain('aria-label="API client" aria-selected="true"');
  });

  it('draws no row for an empty project list', () => {
    const markup = renderToStaticMarkup(
      <ProjectPicker
        label="Proyectos"
        projects={[]}
        selectedId={null}
        onSelect={() => undefined}
      />
    );

    expect(markup).not.toContain('role="option"');
  });

  it('offers the create-project row when the surface can open the dialog (#9)', () => {
    const createLabel = getSharedMessages().contextBar.project.createLabel;
    const markup = renderToStaticMarkup(
      <ProjectPicker
        label="Proyectos"
        projects={projects}
        selectedId={null}
        onSelect={() => undefined}
        onCreateProject={() => undefined}
      />
    );

    // The wireframe draws `Nuevo proyecto` as the picker's last row and the row
    // is the trigger for the dialog (`docs/wireframes/04-project-picker.html`).
    expect(markup).toContain(`aria-label="${createLabel}"`);
    // It is an action, not a selectable project: the listbox keeps exactly the
    // projects it was handed, so it can never be reported as a selection.
    expect(markup.match(/role="option"/g)?.length).toBe(projects.length);
  });

  it('draws no create-project row when no dialog handler is handed down', () => {
    const createLabel = getSharedMessages().contextBar.project.createLabel;
    const markup = renderToStaticMarkup(
      <ProjectPicker
        label="Proyectos"
        projects={projects}
        selectedId={null}
        onSelect={() => undefined}
      />
    );

    expect(markup).not.toContain(createLabel);
  });
});
