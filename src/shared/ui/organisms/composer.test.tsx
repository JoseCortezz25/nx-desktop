import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getSharedMessages } from '@/shared/i18n/messages';
import type { Project } from '@/shared/domain/project.types';
import type { Provider } from '@/shared/domain/provider.types';
import {
  changeProvider,
  resolveSelection
} from '@/shared/domain/selection-chain';
import { Composer, type ComposerProps } from './composer';
import { EMPTY_COMPOSER_DRAFT } from './composer-draft';

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
      selection={resolveSelection(catalog, changeProvider(catalog, 'alpha'))}
      onSelectProvider={() => undefined}
      onSelectModel={() => undefined}
      onSelectEffort={() => undefined}
      projects={projects}
      activeProject={projectAsk}
      branches={['main', 'develop']}
      onSelectProject={() => undefined}
      onChangeApprovalMode={() => undefined}
      draft={EMPTY_COMPOSER_DRAFT}
      onDraftChange={() => undefined}
      onSubmit={() => undefined}
      {...overrides}
    />
  );
}

describe('composer hooks control', () => {
  it('is absent unless a review opener is provided', () => {
    expect(renderComposer({ newHookCount: 3 })).not.toContain(
      'composer__hooks'
    );
  });
  it('names the new-hook count and draws the attention dot', () => {
    const markup = renderComposer({
      newHookCount: 3,
      onOpenHookReview: () => undefined
    });
    expect(markup).toContain(
      `aria-label="${getSharedMessages().composer.hooks.triggerLabel(3)}"`
    );
    expect(markup).toContain('class="composer__hooks-dot" aria-hidden="true"');
    expect(markup).toContain('<circle cx="12" cy="5" r="3"');
  });
  it('defaults to zero new hooks without an attention dot', () => {
    const markup = renderComposer({ onOpenHookReview: () => undefined });
    expect(markup).toContain(
      `aria-label="${getSharedMessages().composer.hooks.triggerLabel(0)}"`
    );
    expect(markup).not.toContain('composer__hooks-dot');
  });
});

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

  it('renders the reconciled chain it is handed, not the catalog default', () => {
    const markup = renderComposer({
      selection: resolveSelection(catalog, changeProvider(catalog, 'beta'))
    });

    expect(markup).toContain('placeholder="Trabaja con Beta"');
    expect(markup).toContain('aria-label="Proveedor: Beta"');
    expect(markup).toContain('aria-label="Modelo: Beta One"');
    expect(markup).not.toContain('Proveedor: Alpha');
  });

  it('draws no placeholder while the selection chain is unresolved', () => {
    expect(renderComposer({ providers: [], selection: null })).not.toContain(
      'placeholder='
    );
  });

  it('renders the provider, model and effort chips for the chosen selection', () => {
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

  it('renders the draft it is handed instead of keeping a local copy', () => {
    // The composer is a controlled field: the shell owns the unsent draft, so a
    // non-empty value it hands down must appear in the field. A component that
    // kept its own draft would render empty here (#40, criterion 2).
    const markup = renderComposer({ draft: { text: 'Keep this draft' } });

    expect(markup).toContain('>Keep this draft</textarea>');
  });

  it('renders the empty draft the owner hands without inventing one', () => {
    const markup = renderComposer({ draft: EMPTY_COMPOSER_DRAFT });

    expect(markup).toContain('></textarea>');
    expect(markup).not.toContain('>Keep this draft</textarea>');
  });

  it('swaps the send control for the cancel control while a run streams', () => {
    const messages = getSharedMessages();
    const markup = renderComposer({
      isRunActive: true,
      onCancelRun: () => undefined
    });

    expect(markup).toContain(
      `aria-label="${messages.composer.cancelRunLabel}"`
    );
    expect(markup).not.toContain(`aria-label="${messages.composer.sendLabel}"`);
  });

  it('draws the send control, not cancel, while no run streams', () => {
    const messages = getSharedMessages();
    const markup = renderComposer({ onCancelRun: () => undefined });

    expect(markup).toContain(`aria-label="${messages.composer.sendLabel}"`);
    expect(markup).not.toContain(
      `aria-label="${messages.composer.cancelRunLabel}"`
    );
  });

  it('renders the send control enabled so a message can be sent', () => {
    const markup = renderComposer();

    // The wireframe keeps the send control enabled on the empty state; the
    // submit rule (not a disabled attribute) guards the path. Operability at the
    // baseline viewport is asserted by the browser geometry probe (#40).
    expect(markup).toContain(
      'class="button button--solid" aria-label="Enviar"'
    );
    expect(markup).not.toMatch(/aria-label="Enviar"[^>]*\sdisabled/);
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

  describe('while no provider is selected', () => {
    const messages = getSharedMessages();

    function renderUnselected(overrides: Partial<ComposerProps> = {}) {
      return renderComposer({ selection: null, ...overrides });
    }

    it('shows the "not defined yet" provider chip, not the catalog first row', () => {
      const markup = renderUnselected();

      expect(markup).toContain(
        `aria-label="${messages.composer.provider.emptyTriggerLabel}"`
      );
      expect(markup).toContain(messages.composer.provider.emptyValue);
      expect(markup).not.toContain('Proveedor: Alpha');
      expect(markup).not.toContain('placeholder=');
    });

    it('keeps the model chip disabled and draws no effort chip', () => {
      const markup = renderUnselected();

      expect(markup).toMatch(
        new RegExp(
          `aria-label="${messages.composer.model.emptyTriggerLabel}"[^>]*\\sdisabled`
        )
      );
      expect(markup).not.toContain('Modelo: Alpha One');
      expect(markup).not.toContain('Esfuerzo:');
    });

    it('disables send and describes why with the visible hint', () => {
      const markup = renderUnselected({ draft: { text: 'Keep this draft' } });
      const hint =
        /<p class="composer-dock__hint" id="([^"]+)">([^<]+)<\/p>/.exec(markup);

      expect(hint?.[2]).toBe(messages.composer.selectionRequiredHint);
      expect(markup).toMatch(
        new RegExp(
          `aria-label="Enviar" aria-describedby="${hint?.[1] ?? 'missing'}" disabled`
        )
      );
      // The draft survives: the field still renders what the shell owns.
      expect(markup).toContain('>Keep this draft</textarea>');
    });

    it('draws the hint for an empty catalog too', () => {
      expect(renderUnselected({ providers: [] })).toContain(
        messages.composer.selectionRequiredHint
      );
    });

    it('drops the hint and the description once a provider is chosen', () => {
      const markup = renderComposer();

      expect(markup).not.toContain('composer-dock__hint');
      expect(markup).not.toContain('aria-describedby');
    });
  });
});
