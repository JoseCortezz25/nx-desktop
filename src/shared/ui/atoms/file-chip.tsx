import { Icon } from './icon';
import './file-chip.css';

export interface FileChipProps {
  /** Workspace-relative path of the referenced file; also its visible text. */
  readonly path: string;
  /** Accessible name, built by the caller from the path. */
  readonly label: string;
  /** Marks the file whose open request is currently active, like the sidebar's active row. */
  readonly isActive?: boolean;
  /** Emits the clicked path up; the owner turns it into an open-file request. */
  readonly onOpen: (path: string) => void;
}

/**
 * Atom: the inline file badge drawn inside a message
 * (`docs/wireframes/README.md`, "Reusable components" — `FileChip`). It is an
 * indivisible primitive: it renders the path and emits the press, and never
 * resolves, reads or opens the file itself.
 */
export function FileChip({
  path,
  label,
  isActive = false,
  onOpen
}: FileChipProps) {
  return (
    <button
      type="button"
      className={`file-chip${isActive ? ' file-chip--active' : ''}`}
      aria-label={label}
      onClick={() => onOpen(path)}
    >
      <Icon name="file" size="sm" />
      <span className="file-chip__path">{path}</span>
    </button>
  );
}
