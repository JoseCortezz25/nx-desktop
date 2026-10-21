/**
 * Copy of the runs feature (#23), per `.claude/rules/text-management.md` §2.
 *
 * The status line under a live turn. A completed run needs no line: its reply
 * is the result. Failure reasons come from the shared IPC error copy, keyed by
 * the public error code, never from the diagnostic `message` field.
 */
import { getSharedErrorMessage } from '@/shared/i18n/messages';
import type { AppErrorDto } from '@/shared/ipc/contracts';
import type { LiveTurn } from './model/live-run';

export const runMessages = {
  status: {
    pending: 'Generando respuesta…',
    streaming: 'Generando respuesta…',
    cancelled: 'Ejecución cancelada',
    failed: (reason: string) => `La ejecución falló: ${reason}`
  }
} as const;

function failureReason(error: AppErrorDto | null): string {
  return getSharedErrorMessage(error?.code ?? 'internal_error');
}

/** The status line for a turn, or `null` when the turn needs none. */
export function getLiveTurnStatusLabel(turn: LiveTurn): string | null {
  switch (turn.status) {
    case 'pending':
      return runMessages.status.pending;
    case 'streaming':
      return runMessages.status.streaming;
    case 'cancelled':
      return runMessages.status.cancelled;
    case 'failed':
      return runMessages.status.failed(failureReason(turn.error));
    case 'completed':
      return null;
  }
}
