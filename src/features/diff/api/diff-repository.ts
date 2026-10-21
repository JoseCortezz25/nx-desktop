/**
 * Port for reading the workspace's current change set into the right panel.
 *
 * The IPC-backed repository (`ipc-diff-repository.ts`) implements this port at
 * runtime (#24) over the Rust workspace diff from #21 (`business-logic.md` §2,
 * `DiffFile`); it is bound to one project. The mock factory remains as a test
 * fixture. The panel never runs `git diff` itself: the change set arrives as
 * domain values, already counted.
 */
import type { DiffFile } from '@/shared/domain/diff-file.types';

export interface DiffRepository {
  /**
   * Reads the changed files of the workspace, in the order the panel draws
   * them. A clean workspace resolves to an empty list, never to `null`.
   */
  readWorkspaceDiff(): Promise<readonly DiffFile[]>;
}
