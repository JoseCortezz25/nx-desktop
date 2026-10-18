import type { Project } from '@/shared/domain/project.types';
import type { ProjectId } from '@/shared/domain/value-objects.types';
import { getSharedMessages } from '@/shared/i18n/messages';
import { Button } from '../atoms/button';
import { Icon } from '../atoms/icon';
import { SelectList } from './select-list';
import type { SelectOption } from './select-list';

export interface ProjectPickerProps {
  /** Accessible name for the listbox. */
  readonly label: string;
  /** The projects served by the project port. */
  readonly projects: readonly Project[];
  /** Id of the project currently applied to the composer, or `null`. */
  readonly selectedId: ProjectId | null;
  readonly onSelect: (projectId: ProjectId) => void;
  /**
   * Opens the create-project dialog (`docs/wireframes/04-project-picker.html`,
   * the `Nuevo proyecto` row). Omitted when the surface has no dialog to open, in
   * which case the row is not drawn at all rather than drawn dead.
   */
  readonly onCreateProject?: () => void;
}

/**
 * Molecule: the project list behind the context bar's project chip
 * (`docs/wireframes/04-project-picker.html`).
 *
 * It reads the projects it is handed — the mock repository today, the typed IPC
 * client later — and never the seed behind the port. Its last row is the
 * wireframe's `Nuevo proyecto` action, which opens the create-project dialog; the
 * row sits *outside* the listbox on purpose, so it can never be reported as a
 * project selection.
 */
export function ProjectPicker({
  label,
  projects,
  selectedId,
  onSelect,
  onCreateProject
}: ProjectPickerProps) {
  const messages = getSharedMessages();
  const options: readonly SelectOption[] = projects.map(project => ({
    id: project.id,
    label: project.name,
    icon: 'folder'
  }));

  return (
    <>
      <SelectList
        label={label}
        options={options}
        selectedId={selectedId}
        onSelect={onSelect}
      />

      {onCreateProject ? (
        <div className="select-list__action">
          <Button
            variant="list"
            label={messages.contextBar.project.createLabel}
            onPress={onCreateProject}
          >
            <Icon name="plus" size="sm" />
            <span className="select-list__text">
              <span className="select-list__title">
                {messages.contextBar.project.createLabel}
              </span>
            </span>
          </Button>
        </div>
      ) : null}
    </>
  );
}
