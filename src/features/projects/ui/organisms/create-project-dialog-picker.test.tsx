import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceFolderPicker } from '../../api/workspace-folder-picker';
import {
  EMPTY_CREATE_PROJECT_DRAFT,
  addSourceFolder,
  changeProjectName
} from '../../model/create-project';
import type {
  CreateProjectDraft,
  SourceFolder
} from '../../model/create-project.types';
import { getProjectMessages } from '../../messages';
import { CreateProjectDialog } from './create-project-dialog';

/**
 * The add-folder wiring of the dialog (#147), driven through an injected
 * picker. The node runner has no DOM, so the shared `Button` atom is captured
 * instead of rendered and its `onPress` is invoked directly — the same
 * prop-capture technique the shell seam suites use. The native dialog is never
 * opened: every folder comes from the stand-in picker.
 */
const pressHandlers = vi.hoisted(() => new Map<string, () => void>());

vi.mock('@/shared/ui/atoms/button', () => ({
  Button: (props: { label?: string; onPress: () => void }) => {
    if (props.label) {
      pressHandlers.set(props.label, props.onPress);
    }
    return null;
  }
}));

const messages = getProjectMessages().createDialog;

const gammaSite: SourceFolder = {
  id: '/workspace/gamma-site',
  label: 'gamma-site',
  path: '/workspace/gamma-site'
};

const docsSite: SourceFolder = {
  id: '/workspace/docs-site',
  label: 'docs-site',
  path: '/workspace/docs-site'
};

function pickerReturning(
  result: Promise<SourceFolder | null>
): WorkspaceFolderPicker {
  return { pickFolder: vi.fn(() => result) };
}

function renderWith(
  draft: CreateProjectDraft,
  folderPicker: WorkspaceFolderPicker,
  onDraftChange: (draft: CreateProjectDraft) => void
) {
  renderToStaticMarkup(
    <CreateProjectDialog
      draft={draft}
      onDraftChange={onDraftChange}
      onSubmit={() => undefined}
      onClose={() => undefined}
      folderPicker={folderPicker}
    />
  );
}

/** Lets the picker promise chain settle. */
function flush() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

beforeEach(() => {
  pressHandlers.clear();
});

describe('create project dialog — adding folders through the picker', () => {
  it('adds the folder the picker returns to the empty draft', async () => {
    const picker = pickerReturning(Promise.resolve(gammaSite));
    const onDraftChange = vi.fn();
    const draft = changeProjectName(EMPTY_CREATE_PROJECT_DRAFT, 'Gamma app');
    renderWith(draft, picker, onDraftChange);

    pressHandlers.get(messages.addFolderLabel)?.();
    await flush();

    expect(picker.pickFolder).toHaveBeenCalledTimes(1);
    expect(onDraftChange).toHaveBeenCalledWith({
      name: 'Gamma app',
      folders: [gammaSite]
    });
  });

  it('appends a further folder from the add-folder row', async () => {
    const picker = pickerReturning(Promise.resolve(docsSite));
    const onDraftChange = vi.fn();
    const draft = addSourceFolder(EMPTY_CREATE_PROJECT_DRAFT, gammaSite);
    renderWith(draft, picker, onDraftChange);

    pressHandlers.get(messages.addFolderRowLabel)?.();
    await flush();

    expect(onDraftChange).toHaveBeenCalledWith({
      name: '',
      folders: [gammaSite, docsSite]
    });
  });

  it('adds nothing when the dialog is cancelled', async () => {
    const picker = pickerReturning(Promise.resolve(null));
    const onDraftChange = vi.fn();
    renderWith(EMPTY_CREATE_PROJECT_DRAFT, picker, onDraftChange);

    pressHandlers.get(messages.addFolderLabel)?.();
    await flush();

    expect(picker.pickFolder).toHaveBeenCalledTimes(1);
    expect(onDraftChange).not.toHaveBeenCalled();
  });

  it('adds nothing when the pick is rejected', async () => {
    const picker = pickerReturning(
      Promise.reject(new Error('validation_failed'))
    );
    const onDraftChange = vi.fn();
    renderWith(EMPTY_CREATE_PROJECT_DRAFT, picker, onDraftChange);

    pressHandlers.get(messages.addFolderLabel)?.();
    await flush();

    expect(onDraftChange).not.toHaveBeenCalled();
  });
});
