import type { Project } from '@/shared/domain/project.types';
import type { ProjectId } from '@/shared/domain/value-objects.types';
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
}

/**
 * Molecule: the project list behind the context bar's project chip
 * (`docs/wireframes/04-project-picker.html`).
 *
 * It reads the projects it is handed — the mock repository today, the typed IPC
 * client later — and never the seed behind the port.
 */
export function ProjectPicker({
  label,
  projects,
  selectedId,
  onSelect
}: ProjectPickerProps) {
  const options: readonly SelectOption[] = projects.map(project => ({
    id: project.id,
    label: project.name,
    icon: 'folder'
  }));

  return (
    <SelectList
      label={label}
      options={options}
      selectedId={selectedId}
      onSelect={onSelect}
    />
  );
}
