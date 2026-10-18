/**
 * Typed IPC client for subagents (issue #16, slice 3).
 *
 * Commands are intent-driven `snake_case` and pass the `{ request }` envelope
 * documented in `docs/ipc/README.md`. The child-run supervisor and the stop use
 * case land in #19/#23, so this module defines the seam only and no client
 * behavior beyond the typed call.
 */
import type { SubagentId } from '@/shared/domain/value-objects.types';
import { ipcInvoke } from '@/shared/ipc/client';
import type {
  CancelSubagentRequestDto,
  ListSubagentsRequestDto,
  SubagentDto
} from './subagent.contracts';

/** Lists the subagents of one run; it never accepts a cross-run id. */
export function listSubagents(runId: string): Promise<SubagentDto[]> {
  const request: ListSubagentsRequestDto = { runId };
  return ipcInvoke<SubagentDto[]>('list_subagents', { request });
}

/**
 * Stops one subagent individually and resolves its updated snapshot.
 *
 * The parent run is untouched; #19/#23 own the transition to `cancelled`
 * (`.claude/knowledge/business-logic.md` §3.2).
 */
export function cancelSubagent(
  runId: string,
  subagentId: SubagentId
): Promise<SubagentDto> {
  const request: CancelSubagentRequestDto = { runId, subagentId };
  return ipcInvoke<SubagentDto>('cancel_subagent', { request });
}
