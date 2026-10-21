/**
 * Port behind the `Abrir` menu: which targets exist on this machine, and the
 * action that opens a file into one.
 *
 * There is no IPC wiring yet (#24), so the installed check is modelled against
 * mock data. The Rust commands land in #21; `openInTarget` here is a **stub**
 * until #24 connects this port, and this ticket must not perform a real launch. Modelling the check
 * behind the port is what makes "VS Code is not installed" testable without a
 * machine that lacks it (`.claude/knowledge/business-logic.md` §3.5 item 3).
 */
import type {
  OpenTarget,
  OpenTargetAvailability
} from '@/shared/domain/open-target.types';

export interface OpenTargetRepository {
  /** Reports every target the machine knows, installed or not. */
  listOpenTargets(): Promise<readonly OpenTargetAvailability[]>;
  /** Stub: records the intent to open `path` in `target`, launches nothing. */
  openInTarget(target: OpenTarget, path: string): Promise<void>;
}
