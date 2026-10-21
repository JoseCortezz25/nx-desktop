import { useEffect, useRef, useState } from 'react';
import { Button } from '@/shared/ui/atoms/button';
import { Icon } from '@/shared/ui/atoms/icon';
import { TextInput } from '@/shared/ui/atoms/text-input';
import { Dialog } from '@/shared/ui/molecules/dialog';
import {
  addSourceFolder,
  changeProjectName,
  removeSourceFolder,
  toCreateProjectInput,
  validateProjectName
} from '../../model/create-project';
import type {
  CreateProjectDraft,
  CreateProjectInput
} from '../../model/create-project.types';
import type { WorkspaceFolderPicker } from '../../api/workspace-folder-picker';
import { useWorkspaceFolderPicker } from '../../hooks/use-workspace-folder-picker';
import { getProjectMessages } from '../../messages';
import { SourceFolderRow } from '../molecules/source-folder-row';
import './create-project-dialog.css';

export interface CreateProjectDialogProps {
  /**
   * The in-progress draft, or `null` while the dialog is closed. The shell owns
   * this value (one owner for the flow), which is what makes the dialog a
   * controlled surface: it renders the draft it is handed, reports every change
   * upward, and draws nothing at all when the draft is `null`.
   */
  readonly draft: CreateProjectDraft | null;
  /** Reports the draft a keystroke, folder add or folder removal produces. */
  readonly onDraftChange: (draft: CreateProjectDraft) => void;
  /** Handed the validated input; the shell creates the project through the port. */
  readonly onSubmit: (input: CreateProjectInput) => void;
  /** Reports a dismissal (`Cancelar`, the close control, Escape or the backdrop). */
  readonly onClose: () => void;
  /**
   * Where added folders come from. Defaults to the native folder dialog the
   * Rust core opens (#147); tests inject their own picker.
   */
  readonly folderPicker?: WorkspaceFolderPicker;
}

/**
 * Organism: the create-project modal (`docs/wireframes/05-create-project-empty.html`
 * and `06-create-project-folder.html`) for both required states — no folders and
 * with a source folder added.
 *
 * It is a self-contained product section, so it is an organism, but it holds no
 * catalog and calls no raw IPC: creating a project is the shell's
 * `useProjectCatalog`, and adding a folder goes through `useWorkspaceFolderPicker`
 * (the native dialog, #147). The only state it owns is presentation — whether a
 * submit has been attempted, which decides if the name error is drawn.
 *
 * Its sub-molecules are the shared `Dialog` (surface and dismissal) and the
 * feature `SourceFolderRow` (one folder). It never imports from `src/app/`.
 */
export function CreateProjectDialog({
  draft,
  onDraftChange,
  onSubmit,
  onClose,
  folderPicker
}: CreateProjectDialogProps) {
  const messages = getProjectMessages().createDialog;
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const folderPicking = useWorkspaceFolderPicker(folderPicker);
  // The native dialog resolves later, so the picked folder joins the draft the
  // shell holds by then, not the one this render closed over.
  const latestDraft = useRef(draft);

  useEffect(() => {
    latestDraft.current = draft;
  });

  if (!draft) {
    return null;
  }

  // A local binding so the handlers below close over the narrowed draft.
  const currentDraft = draft;
  const validation = validateProjectName(currentDraft.name);
  const showNameError = hasAttemptedSubmit && validation.status === 'empty';
  const hasFolders = currentDraft.folders.length > 0;

  function handleNameChange(name: string) {
    onDraftChange(changeProjectName(currentDraft, name));
  }

  function handleAddFolder() {
    folderPicking.pickFolder(folder => {
      const draftNow = latestDraft.current;

      if (draftNow) {
        onDraftChange(addSourceFolder(draftNow, folder));
      }
    });
  }

  function handleRemoveFolder(folderId: string) {
    onDraftChange(removeSourceFolder(currentDraft, folderId));
  }

  function handleSubmit() {
    const input = toCreateProjectInput(currentDraft);

    if (!input) {
      // Keeps the create control enabled, like the composer's send: a blank name
      // is refused here and explained, instead of removing the control's meaning.
      setHasAttemptedSubmit(true);
      return;
    }

    setHasAttemptedSubmit(false);
    onSubmit(input);
  }

  function handleCancel() {
    setHasAttemptedSubmit(false);
    onClose();
  }

  return (
    <Dialog
      title={messages.title}
      closeLabel={messages.closeLabel}
      onClose={handleCancel}
    >
      <div className="create-project-dialog__field">
        <Icon name="folder" size="sm" />
        <TextInput
          label={messages.nameLabel}
          value={currentDraft.name}
          placeholder={messages.namePlaceholder}
          onChange={handleNameChange}
        />
      </div>

      {showNameError ? (
        <p className="create-project-dialog__error" role="alert">
          {messages.nameError}
        </p>
      ) : null}

      <div className="create-project-dialog__folders-label">
        <span>{messages.foldersLabel}</span>
        <span className="create-project-dialog__folders-machine">
          <Icon name="monitor" size="sm" />
          {messages.foldersMachineLabel}
        </span>
      </div>

      {hasFolders ? (
        <div className="create-project-dialog__folder-box">
          {currentDraft.folders.map(folder => (
            <SourceFolderRow
              key={folder.id}
              folder={folder}
              removeLabel={messages.removeFolderLabel(folder.label)}
              onRemove={() => handleRemoveFolder(folder.id)}
            />
          ))}
          <Button
            variant="list"
            label={messages.addFolderRowLabel}
            isDisabled={folderPicking.isPicking}
            onPress={handleAddFolder}
          >
            <Icon name="folder" size="sm" />
            <span>{messages.addFolderRowLabel}</span>
          </Button>
        </div>
      ) : (
        <div className="create-project-dialog__dropzone">
          <p className="create-project-dialog__hint">
            {messages.foldersEmptyHint}
          </p>
          <Button
            variant="plain"
            label={messages.addFolderLabel}
            isDisabled={folderPicking.isPicking}
            onPress={handleAddFolder}
          >
            <Icon name="folder" size="sm" />
            <span>{messages.addFolderLabel}</span>
          </Button>
        </div>
      )}

      {folderPicking.hasPickError ? (
        <p className="create-project-dialog__error" role="alert">
          {messages.folderPickError}
        </p>
      ) : null}

      <div className="create-project-dialog__actions">
        <Button variant="text" onPress={handleCancel}>
          {messages.cancelLabel}
        </Button>
        <Button
          variant="primary"
          label={messages.submitLabel}
          onPress={handleSubmit}
        >
          {messages.submitLabel}
        </Button>
      </div>
    </Dialog>
  );
}
