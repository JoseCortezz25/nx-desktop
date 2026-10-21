/**
 * Port behind the `Abrir` menu: which targets exist on this machine, and the
 * action that opens a file into one.
 *
 * The IPC-backed repository (`ipc-open-target-repository.ts`) implements this
 * port at runtime (#24) over the Rust commands from #21; the mock factory
 * remains as a test fixture. Modelling the check behind the port is what makes
 * "VS Code is not installed" testable without a machine that lacks it
 * (`.claude/knowledge/business-logic.md` §3.5 item 3).
 */
import type {
  OpenTarget,
  OpenTargetAvailability
} from '@/shared/domain/open-target.types';
import type {
  ProjectId,
  WorkspacePath
} from '@/shared/domain/value-objects.types';

export interface OpenTargetRepository {
  /** Reports every target the machine knows, installed or not. */
  listOpenTargets(): Promise<readonly OpenTargetAvailability[]>;
  /**
   * Asks the core to open the workspace-relative `path` of `projectId` in
   * `target`; the core resolves the project's roots and validates the path and
   * the allowed target before launching.
   */
  openInTarget(
    projectId: ProjectId,
    target: OpenTarget,
    path: WorkspacePath
  ): Promise<void>;
}
