import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Project } from '@/shared/domain/project.types';
import type { Provider } from '@/shared/domain/provider.types';
import { Composer, type ComposerProps } from './composer';

/**
 * Smokes the composition the unit tests cannot: that the organism renders the
 * prompt field, the add trigger, the send control, the three selector chips, the
 * context bar and the approval chip. Static rendering keeps this DOM-free,
 * matching the node test environment; the selection chain itself is covered in
 * `selection-chain.test.ts` and the port fixtures in their own suites.
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

/**
 * Two projects whose approval policies differ, so the chip's value can only be
 * explained by the project it is handed — not by a default baked into the
 * component.
 */
const projectAsk: Project = {
  id: 'proj-ask',
  name: 'Alpha project',
  workspaceFolders: ['/workspace/alpha'],
  approvalMode: 'ask_always',
  hookDecisions: [],
  conversationIds: []
};

const projectAuto: Project = {
  id: 'proj-auto',
  name: 'Beta project',
  workspaceFolders: ['/workspace/beta'],
  approvalMode: 'auto_approve',
  hookDecisions: [],
  conversationIds: []
};

const projectFull: Project = {
  id: 'proj-full',
  name: 'Gamma project',
  workspaceFolders: ['/workspace/gamma'],
  approvalMode: 'full_access',
  hookDecisions: [],
  conversationIds: []
};

const projects: readonly Project[] = [projectAsk, projectAuto];

function renderComposer(overrides: Partial<ComposerProps> = {}) {
  return renderToStaticMarkup(
    <Composer
      providers={catalog}
      projects={projects}
      activeProject={projectAsk}
      branches={['main', 'develop']}
      onSelectProject={() => undefined}
      onChangeApprovalMode={() => undefined}
      onSubmit={() => undefined}
      {...overrides}
    />
  );
}

describe('composer', () => {
  it('renders the prompt field, the add trigger and the send control', () => {
    const markup = renderComposer();

    expect(markup).toContain('class="composer"');
    expect(markup).toContain('class="composer-bar"');
    expect(markup).toContain('aria-label="Mensaje"');
    expect(markup).toContain('aria-label="Añadir"');
    expect(markup).toContain('aria-label="Enviar"');
  });

  it('derives the placeholder from the selected provider', () => {
    expect(renderComposer()).toContain('placeholder="Trabaja con Alpha"');
  });

  it('draws no placeholder while the provider catalog is loading', () => {
    expect(renderComposer({ providers: [] })).not.toContain('placeholder=');
  });

  it('renders the provider, model and effort chips for the default selection', () => {
    const markup = renderComposer();

    expect(markup).toContain('class="button button--pill"');
    expect(markup).toContain('aria-label="Proveedor: Alpha"');
    expect(markup).toContain('aria-label="Modelo: Alpha One"');
    expect(markup).toContain('aria-label="Esfuerzo: Ligero"');
  });

  it('names no wireframe placeholder provider or model', () => {
    const markup = renderComposer();

    expect(markup).not.toContain('ChatGPT');
    expect(markup).not.toContain('GPT-6.1 Sol');
  });

  describe('context bar', () => {
    it('draws the bar with the active project and the environment it runs in', () => {
      const markup = renderComposer();

      expect(markup).toContain('class="context-bar"');
      expect(markup).toContain('aria-label="Proyecto: Alpha project"');
      expect(markup).toContain('aria-label="Entorno: Este ordenador"');
    });

    it('falls back to the picker prompt while the project list is loading', () => {
      const markup = renderComposer({ activeProject: null });

      expect(markup).toContain('Elegir proyecto');
    });
  });

  describe('approval chip', () => {
    it('reads the level from the first project', () => {
      const markup = renderComposer({ activeProject: projectAsk });

      expect(markup).toContain('aria-label="Aprobación: Solicitar aprobación"');
    });

    it('reads the level from the other project, not a local default', () => {
      const markup = renderComposer({ activeProject: projectAuto });

      expect(markup).toContain(
        'aria-label="Aprobación: Aprobar automáticamente"'
      );
      expect(markup).not.toContain(
        'aria-label="Aprobación: Solicitar aprobación"'
      );
    });

    it('marks the unrestricted level with the warning tone', () => {
      const markup = renderComposer({ activeProject: projectFull });

      expect(markup).toContain('aria-label="Aprobación: Acceso completo"');
      expect(markup).toContain('button--pill button--warn');
    });

    it('keeps the other levels off the warning tone', () => {
      expect(renderComposer({ activeProject: projectAsk })).not.toContain(
        'button--warn'
      );
      expect(renderComposer({ activeProject: projectAuto })).not.toContain(
        'button--warn'
      );
    });

    it('draws no approval chip while no project is active', () => {
      const markup = renderComposer({ activeProject: null });

      expect(markup).not.toContain('Aprobación:');
    });
  });
});
