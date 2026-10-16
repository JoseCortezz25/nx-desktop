import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { RunEnvironment } from '@/shared/domain/run-environment.types';
import { getSharedMessages } from '@/shared/i18n/messages';
import { EnvironmentPanel } from './environment-panel';

const environment: RunEnvironment = {
  useNewWorktree: false,
  gitBranch: 'release/2.0',
  environmentName: ''
};

/**
 * A branch list that names nothing the app hardcodes: every row the panel draws
 * must come from the `branches` prop — the workspace port's answer — and not
 * from a constant compiled into the component.
 */
const branches: readonly string[] = ['release/2.0', 'develop', 'hotfix/login'];

function renderPanel(
  overrides: Partial<Parameters<typeof EnvironmentPanel>[0]>
) {
  return renderToStaticMarkup(
    <EnvironmentPanel
      label="Entorno de ejecución"
      environment={environment}
      branches={branches}
      branchListLabel="Ramas"
      onWorktreeToggle={() => undefined}
      onBranchSelect={() => undefined}
      onEnvironmentNameChange={() => undefined}
      {...overrides}
    />
  );
}

describe('environment panel', () => {
  it('draws the three RunEnvironment fields', () => {
    const markup = renderPanel({});
    const messages = getSharedMessages();

    expect(markup).toContain(messages.environment.worktree);
    expect(markup).toContain(messages.environment.branch);
    expect(markup).toContain(messages.environment.name);
  });

  it('draws the worktree flag as a switch carrying the field value', () => {
    expect(renderPanel({})).toContain('aria-checked="false"');
    expect(
      renderPanel({
        environment: { ...environment, useNewWorktree: true }
      })
    ).toContain('aria-checked="true"');
  });

  it('lists exactly the branches it is handed, and marks the run branch', () => {
    const markup = renderPanel({});

    for (const branch of branches) {
      expect(markup).toContain(`aria-label="${branch}"`);
    }
    expect(markup.match(/role="option"/g)?.length).toBe(branches.length);
    expect(markup).toContain('aria-label="release/2.0" aria-selected="true"');
  });

  it('follows a different branch list instead of a built-in one', () => {
    const markup = renderPanel({
      environment: { ...environment, gitBranch: 'trunk' },
      branches: ['trunk']
    });

    expect(markup.match(/role="option"/g)?.length).toBe(1);
    expect(markup).toContain('aria-label="trunk" aria-selected="true"');
    expect(markup).not.toContain('develop');
  });

  it('draws the environment name from the field value', () => {
    expect(renderPanel({})).toContain('value=""');
    expect(
      renderPanel({
        environment: { ...environment, environmentName: 'staging' }
      })
    ).toContain('value="staging"');
  });

  it('shows the empty-environment hint as the field placeholder', () => {
    expect(renderPanel({})).toContain(
      `placeholder="${getSharedMessages().environment.namePlaceholder}"`
    );
  });
});
