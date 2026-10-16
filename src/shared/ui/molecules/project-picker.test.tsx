import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Project } from '@/shared/domain/project.types';
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
});
