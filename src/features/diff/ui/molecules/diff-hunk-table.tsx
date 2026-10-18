import type { DiffHunk } from '@/shared/domain/diff-file.types';
import { getSharedMessages } from '@/shared/i18n/messages';
import { buildHunkRows } from '../../model/diff-view';
import './diff-hunk-table.css';

export interface DiffHunkTableProps {
  /** Workspace-relative path of the file, used for the table's accessible name. */
  readonly path: string;
  /** The hunk to draw: its header and its lines in the order they appear. */
  readonly hunk: DiffHunk;
}

/**
 * Molecule: one unified hunk of a changed file — the header line plus one row per
 * diff line with both line-number gutters and the `+` / `-` marker
 * (`docs/wireframes/18-chat-with-diff.html`, `table.diff`; screen 18).
 *
 * It is presentational: the numbers are derived by `buildHunkRows` and the row
 * class comes from the line kind, so added and removed rows get their green and
 * red treatment from the line itself rather than from an index or a guess.
 * `split` mode is out of scope (business-logic §3.5 item 1), so this is the only
 * table shape the panel draws.
 */
export function DiffHunkTable({ path, hunk }: DiffHunkTableProps) {
  const messages = getSharedMessages();
  const rows = buildHunkRows(hunk);

  return (
    <table
      className="diff-hunk"
      aria-label={messages.diff.hunk.tableLabel(path)}
    >
      <colgroup>
        <col className="diff-hunk__gutter" />
        <col className="diff-hunk__gutter" />
        <col className="diff-hunk__marker-column" />
        <col />
      </colgroup>
      <tbody>
        <tr className="diff-hunk__row diff-hunk__row--hunk">
          <td className="diff-hunk__header" colSpan={4}>
            {hunk.header}
          </td>
        </tr>
        {rows.map((row, index) => (
          <tr
            key={index}
            className={`diff-hunk__row diff-hunk__row--${row.kind}`}
          >
            <td className="diff-hunk__number" aria-hidden="true">
              {row.oldNumber ?? ''}
            </td>
            <td className="diff-hunk__number" aria-hidden="true">
              {row.newNumber ?? ''}
            </td>
            <td className="diff-hunk__marker" aria-hidden="true">
              {row.marker}
            </td>
            <td className="diff-hunk__code">
              {row.content === '' ? ' ' : row.content}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
