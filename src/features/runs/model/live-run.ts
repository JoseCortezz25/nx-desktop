/**
 * Live-run presentation model (issue #23).
 *
 * The Rust `RunSupervisor` owns every active run; the webview only renders the
 * frames a run streams through its `Channel`. A {@link LiveTurn} is that
 * ephemeral presentation: the prompt the user sent plus the text and tool
 * activity accumulated from the stream so far. Everything here is pure so the
 * frame rules — ordering, stale-run rejection and "first terminal frame wins" —
 * are testable without a webview.
 */
import type {
  Conversation,
  ConversationMessage
} from '@/shared/domain/conversation.types';
import type { RunEnvironment } from '@/shared/domain/run-environment.types';
import type { ToolCall } from '@/shared/domain/tool-call.types';
import type {
  ConversationId,
  IsoTimestamp,
  ModelId,
  ProjectId,
  ProviderId
} from '@/shared/domain/value-objects.types';
import type { AppErrorDto } from '@/shared/ipc/contracts';

/** Lifecycle of a live turn, aligned with the run lifecycle (#19). */
export const LIVE_RUN_STATUSES = [
  'pending',
  'streaming',
  'completed',
  'failed',
  'cancelled'
] as const;

export type LiveRunStatus = (typeof LIVE_RUN_STATUSES)[number];

/** The three terminal states; a turn never leaves one once it reaches it. */
const TERMINAL_STATUSES: ReadonlySet<LiveRunStatus> = new Set<LiveRunStatus>([
  'completed',
  'failed',
  'cancelled'
]);

export function isTerminalRunStatus(status: LiveRunStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/** What the composer hands up to start one run. */
export interface StartRunInput {
  readonly conversationId: ConversationId;
  readonly projectId: ProjectId;
  readonly providerId: ProviderId;
  readonly modelId: ModelId;
  readonly effortLevel: string;
  readonly prompt: string;
  readonly environment: RunEnvironment;
}

/**
 * One frame of a run stream, in domain terms. Mirrors the closed six-kind wire
 * union with the tool call mapped to the domain `ToolCall`.
 */
export type RunFrame =
  | { readonly kind: 'started'; readonly runId: string; readonly seq: number }
  | {
      readonly kind: 'textDelta';
      readonly runId: string;
      readonly seq: number;
      readonly text: string;
    }
  | {
      readonly kind: 'toolActivity';
      readonly runId: string;
      readonly seq: number;
      readonly toolCall: ToolCall;
    }
  | { readonly kind: 'completed'; readonly runId: string; readonly seq: number }
  | {
      readonly kind: 'failed';
      readonly runId: string;
      readonly seq: number;
      readonly error: AppErrorDto;
    }
  | {
      readonly kind: 'cancelled';
      readonly runId: string;
      readonly seq: number;
    };

/** One sent prompt and the response streamed for it. */
export interface LiveTurn {
  /** Local presentation token; stable before the core assigns a `runId`. */
  readonly id: string;
  readonly conversationId: ConversationId;
  readonly prompt: string;
  readonly startedAt: IsoTimestamp;
  /** The run this turn is bound to, or `null` before the first frame/reply. */
  readonly runId: string | null;
  /** Highest `seq` applied; frames at or below it are duplicates or stale. */
  readonly lastSeq: number;
  readonly status: LiveRunStatus;
  readonly text: string;
  readonly toolCalls: readonly ToolCall[];
  readonly error: AppErrorDto | null;
}

/** Creates the pending turn shown the instant a prompt is sent. */
export function createLiveTurn(
  id: string,
  input: StartRunInput,
  startedAt: IsoTimestamp
): LiveTurn {
  return {
    id,
    conversationId: input.conversationId,
    prompt: input.prompt,
    startedAt,
    runId: null,
    lastSeq: 0,
    status: 'pending',
    text: '',
    toolCalls: [],
    error: null
  };
}

/**
 * Binds the turn to the run id the core reported. A turn already bound keeps
 * its id: the first binding (first frame or `start_run` reply) is the authority.
 */
export function bindRunId(turn: LiveTurn, runId: string): LiveTurn {
  return turn.runId === null ? { ...turn, runId } : turn;
}

function upsertToolCall(
  toolCalls: readonly ToolCall[],
  toolCall: ToolCall
): readonly ToolCall[] {
  const index = toolCalls.findIndex(call => call.id === toolCall.id);
  if (index === -1) {
    return [...toolCalls, toolCall];
  }
  return toolCalls.map((call, position) =>
    position === index ? toolCall : call
  );
}

/**
 * Applies one stream frame. The turn is returned unchanged (same reference)
 * when the frame must be ignored:
 *
 * - the turn is already terminal (no frame may follow a terminal one);
 * - the frame belongs to another run (stale run id);
 * - the frame's `seq` is not past the last applied one (duplicate/reordered).
 */
export function applyRunFrame(turn: LiveTurn, frame: RunFrame): LiveTurn {
  if (isTerminalRunStatus(turn.status)) {
    return turn;
  }
  if (turn.runId !== null && frame.runId !== turn.runId) {
    return turn;
  }
  if (frame.seq <= turn.lastSeq) {
    return turn;
  }

  const base: LiveTurn = { ...turn, runId: frame.runId, lastSeq: frame.seq };

  switch (frame.kind) {
    case 'started':
      return { ...base, status: 'streaming' };
    case 'textDelta':
      return { ...base, status: 'streaming', text: turn.text + frame.text };
    case 'toolActivity':
      return {
        ...base,
        status: 'streaming',
        toolCalls: upsertToolCall(turn.toolCalls, frame.toolCall)
      };
    case 'completed':
      return { ...base, status: 'completed' };
    case 'failed':
      return { ...base, status: 'failed', error: frame.error };
    case 'cancelled':
      return { ...base, status: 'cancelled' };
  }
}

/**
 * Ends a turn that never reached a terminal frame (for example `start_run`
 * rejected before streaming). A terminal turn is returned unchanged.
 */
export function failLiveTurn(turn: LiveTurn, error: AppErrorDto): LiveTurn {
  return isTerminalRunStatus(turn.status)
    ? turn
    : { ...turn, status: 'failed', error };
}

/**
 * Ends a turn with the terminal status an authoritative snapshot reported
 * (`cancel_run` reply), used only when no terminal frame arrived first.
 */
export function settleLiveTurn(
  turn: LiveTurn,
  status: LiveRunStatus
): LiveTurn {
  if (isTerminalRunStatus(turn.status) || !isTerminalRunStatus(status)) {
    return turn;
  }
  return { ...turn, status };
}

function toMessages(turn: LiveTurn): readonly ConversationMessage[] {
  const prompt: ConversationMessage = {
    id: `${turn.id}-prompt`,
    role: 'user',
    content: turn.prompt,
    createdAt: turn.startedAt,
    toolCalls: []
  };
  if (turn.text.length === 0 && turn.toolCalls.length === 0) {
    return [prompt];
  }
  return [
    prompt,
    {
      id: `${turn.id}-reply`,
      role: 'assistant',
      content: turn.text,
      createdAt: turn.startedAt,
      toolCalls: turn.toolCalls
    }
  ];
}

/**
 * Projects the live turns of one conversation after its persisted messages, so
 * the conversation view renders the stream incrementally through the same
 * message rows it already draws.
 */
export function appendLiveTurns(
  conversation: Conversation,
  turns: readonly LiveTurn[]
): Conversation {
  const own = turns.filter(turn => turn.conversationId === conversation.id);
  if (own.length === 0) {
    return conversation;
  }
  return {
    ...conversation,
    messages: [...conversation.messages, ...own.flatMap(toMessages)]
  };
}

/** The most recent turn of one conversation, or `null`. */
export function findLatestTurn(
  turns: readonly LiveTurn[],
  conversationId: ConversationId
): LiveTurn | null {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (turn.conversationId === conversationId) {
      return turn;
    }
  }
  return null;
}
