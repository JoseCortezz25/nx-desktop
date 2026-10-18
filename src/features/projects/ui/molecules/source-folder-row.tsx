import { Button } from '@/shared/ui/atoms/button';
import { Icon } from '@/shared/ui/atoms/icon';
import type { SourceFolder } from '../../model/create-project.types';
import './source-folder-row.css';

export interface SourceFolderRowProps {
  /** The folder this row stands for, as the draft carries it. */
  readonly folder: SourceFolder;
  /** Accessible name for the remove control (interpolates the folder name). */
  readonly removeLabel: string;
  readonly onRemove: () => void;
}

/**
 * Molecule: one source folder of the create-project dialog
 * (`docs/wireframes/06-create-project-folder.html`, `.dialog .box .row` — folder
 * glyph, folder name, remove control).
 *
 * It renders the folder it is handed and reports the removal upward; the dialog
 * owns the draft list, so this row never edits it.
 */
export function SourceFolderRow({
  folder,
  removeLabel,
  onRemove
}: SourceFolderRowProps) {
  return (
    <div className="source-folder-row">
      <Icon name="folder" size="sm" />
      <span className="source-folder-row__label">{folder.label}</span>
      <Button variant="icon" label={removeLabel} onPress={onRemove}>
        <Icon name="close" size="sm" />
      </Button>
    </div>
  );
}
