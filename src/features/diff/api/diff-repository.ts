/**
 * Port for reading the workspace's current change set into the right panel.
 *
 * Backed by the mock repository today and by the future typed IPC client once
 * the Rust core exposes a workspace diff (`business-logic.md` §2, `DiffFile`;
 * ticket #24 connects it). The panel never runs `git diff` itself: the change
 * set arrives as domain values, already counted.
 */
import type { DiffFile } from '@/shared/domain/diff-file.types';

export interface DiffRepository {
  /**
   * Reads the changed files of the workspace, in the order the panel draws
   * them. A clean workspace resolves to an empty list, never to `null`.
   */
  readWorkspaceDiff(): Promise<readonly DiffFile[]>;
}
