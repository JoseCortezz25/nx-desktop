import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_CREATE_PROJECT_DRAFT,
  MOCK_SOURCE_FOLDERS,
  addSourceFolder,
  changeProjectName,
  toCreateProjectInput
} from '../../model/create-project';
import { getProjectMessages } from '../../messages';
import { CreateProjectDialog } from './create-project-dialog';

/**
 * The dialog organism is **controlled** by the shell (`draft` + `onDraftChange`),
 * which is what lets this node-environment suite render both states the issue
 * requires — no folders and with a folder — instead of only the empty one a
 * state-owning component could reach.
 */
const messages = getProjectMessages().createDialog;

function render(draft: Parameters<typeof CreateProjectDialog>[0]['draft']) {
  return renderToStaticMarkup(
    <CreateProjectDialog
      draft={draft}
      onDraftChange={() => undefined}
      onSubmit={() => undefined}
      onClose={() => undefined}
    />
  );
}

describe('create project dialog — empty state', () => {
  it('draws nothing while no draft is in progress', () => {
    expect(render(null)).toBe('');
  });

  it('renders the name field and the add-folder prompt with no folder row', () => {
    const markup = render(EMPTY_CREATE_PROJECT_DRAFT);

    expect(markup).toContain(`aria-label="${messages.nameLabel}"`);
    expect(markup).toContain(messages.foldersLabel);
    expect(markup).toContain(messages.foldersEmptyHint);
    expect(markup).toContain(messages.foldersMachineLabel);
    expect(markup).toContain(`aria-label="${messages.addFolderLabel}"`);
    expect(markup).not.toContain('class="source-folder-row"');
  });

  it('renders the draft name it is handed instead of keeping a local copy', () => {
    const markup = render(
      changeProjectName(EMPTY_CREATE_PROJECT_DRAFT, 'Gamma app')
    );

    expect(markup).toContain('value="Gamma app"');
  });

  it('carries the dialog actions', () => {
    const markup = render(EMPTY_CREATE_PROJECT_DRAFT);

    expect(markup).toContain(`>${messages.cancelLabel}<`);
    expect(markup).toContain(`aria-label="${messages.submitLabel}"`);
    // The primary action uses the shared filled text variant; `solid` is the round
    // send icon, which needed a local geometry override to look like a button (#60).
    expect(markup).toMatch(/button button--primary/);
    expect(markup).not.toContain('button--solid');
  });

  it('keeps the create action operable on the empty state and guards it in the rule', () => {
    const markup = render(EMPTY_CREATE_PROJECT_DRAFT);

    // Like the composer's send control, the button is not disabled; the submit
    // rule is what protects the path, and the rule rejects a blank name.
    expect(markup).not.toMatch(
      new RegExp(`aria-label="${messages.submitLabel}"[^>]*\\sdisabled`)
    );
    expect(toCreateProjectInput(EMPTY_CREATE_PROJECT_DRAFT)).toBeNull();
  });
});

describe('create project dialog — folder-added state', () => {
  const draft = addSourceFolder(
    changeProjectName(EMPTY_CREATE_PROJECT_DRAFT, 'Gamma app')
  );

  it('renders one removable row per added folder', () => {
    const markup = render(draft);

    expect(markup.match(/class="source-folder-row"/g)?.length).toBe(1);
    expect(markup).toContain(MOCK_SOURCE_FOLDERS[0].label);
    expect(markup).toContain(
      `aria-label="${messages.removeFolderLabel(MOCK_SOURCE_FOLDERS[0].label)}"`
    );
  });

  it('swaps the empty prompt for the add-folder row', () => {
    const markup = render(draft);

    expect(markup).toContain(`aria-label="${messages.addFolderRowLabel}"`);
    expect(markup).not.toContain(messages.foldersEmptyHint);
  });
});

describe('create project dialog — copy discipline', () => {
  it('names no wireframe placeholder project', () => {
    const markup = `${render(EMPTY_CREATE_PROJECT_DRAFT)}${render(
      addSourceFolder(EMPTY_CREATE_PROJECT_DRAFT)
    )}`;

    expect(markup).not.toContain('nx-desktop');
    expect(markup).not.toContain('fabrica-skills');
    expect(markup).not.toContain('GPT-6.1 Sol');
    expect(markup).not.toContain('ChatGPT');
  });
});
