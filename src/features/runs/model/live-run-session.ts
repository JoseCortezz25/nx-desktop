/**
 * Live-run session (issue #23): the one owner of the active run subscription.
 *
 * The `useLiveRun` hook creates one session per mount and disposes it on
 * unmount; the session holds the subscription, applies frames through the pure
 * rules in `live-run.ts`, and reports each new snapshot. It has no React
 * dependency, so the lifecycle guarantees are unit-tested directly:
 *
 * - **One run at a time.** `start` refuses while a run is active, so a double
 *   send cannot open a second stream.
 * - **Exactly-once unsubscribe.** The subscription is released on the first
 *   of: terminal frame, `start_run` rejection, or `dispose`. The active slot is
 *   cleared at that moment, so no later path can release it again.
 * - **Stale frames are dropped.** Frames for a turn that is no longer active,
 *   frames after `dispose`, frames from another run id and out-of-order `seq`
 *   never change the snapshot.
 * - **Cancel before the run id is known** is remembered and sent as soon as
 *   the first frame or the `start_run` reply binds the id.
 */
import type { RunRepository, RunSubscription } from '../api/run-repository';
import { toAppErrorDto } from '@/shared/ipc/contracts';
import type { IsoTimestamp } from '@/shared/domain/value-objects.types';
import {
  applyRunFrame,
  bindRunId,
  createLiveTurn,
  failLiveTurn,
  isTerminalRunStatus,
  settleLiveTurn,
  type LiveTurn,
  type RunFrame,
  type StartRunInput
} from './live-run';

/** What the session reports after every change. */
export interface LiveRunSnapshot {
  readonly turns: readonly LiveTurn[];
  readonly isRunning: boolean;
}

export const EMPTY_LIVE_RUN_SNAPSHOT: LiveRunSnapshot = {
  turns: [],
  isRunning: false
};

export interface LiveRunSessionOptions {
  readonly repository: RunRepository;
  readonly onChange: (snapshot: LiveRunSnapshot) => void;
  readonly now: () => IsoTimestamp;
}

export interface LiveRunSession {
  /** Starts a run; returns `false` when one is already active or disposed. */
  start(input: StartRunInput): boolean;
  /** Cancels the active run, if any. Idempotent. */
  cancel(): void;
  /** Releases the subscription and stops reporting. Idempotent. */
  dispose(): void;
}

interface ActiveRun {
  readonly turnId: string;
  readonly subscription: RunSubscription;
  isCancelRequested: boolean;
  isCancelSent: boolean;
}

export function createLiveRunSession({
  repository,
  onChange,
  now
}: LiveRunSessionOptions): LiveRunSession {
  let turns: readonly LiveTurn[] = [];
  let active: ActiveRun | null = null;
  let isDisposed = false;
  let nextTurnNumber = 1;

  function emit() {
    if (!isDisposed) {
      onChange({ turns, isRunning: active !== null });
    }
  }

  function findTurn(turnId: string): LiveTurn | undefined {
    return turns.find(turn => turn.id === turnId);
  }

  function replaceTurn(next: LiveTurn) {
    turns = turns.map(turn => (turn.id === next.id ? next : turn));
  }

  function isActiveTurn(turnId: string): boolean {
    return !isDisposed && active !== null && active.turnId === turnId;
  }

  /** Releases the active subscription exactly once and clears the slot. */
  function release() {
    const current = active;
    active = null;
    current?.subscription.unsubscribe();
  }

  function sendCancelIfRequested() {
    const current = active;
    if (!current || !current.isCancelRequested || current.isCancelSent) {
      return;
    }
    const runId = findTurn(current.turnId)?.runId ?? null;
    if (runId === null) {
      return;
    }
    current.isCancelSent = true;
    const { turnId } = current;
    repository.cancelRun(runId).then(
      status => {
        // The stream's terminal frame is the authority; the reply only
        // settles a turn whose terminal frame never arrived.
        const turn = findTurn(turnId);
        if (!isActiveTurn(turnId) || !turn) {
          return;
        }
        const settled = settleLiveTurn(turn, status);
        if (settled !== turn) {
          replaceTurn(settled);
          release();
          emit();
        }
      },
      () => {
        // A rejected cancel leaves the run to its own terminal frame.
      }
    );
  }

  function handleFrame(turnId: string, frame: RunFrame) {
    const turn = findTurn(turnId);
    if (!isActiveTurn(turnId) || !turn) {
      return;
    }
    const next = applyRunFrame(turn, frame);
    if (next === turn) {
      return;
    }
    replaceTurn(next);
    if (isTerminalRunStatus(next.status)) {
      release();
    } else {
      sendCancelIfRequested();
    }
    emit();
  }

  function handleRunId(turnId: string, runId: string) {
    const turn = findTurn(turnId);
    if (!isActiveTurn(turnId) || !turn) {
      return;
    }
    replaceTurn(bindRunId(turn, runId));
    sendCancelIfRequested();
  }

  function handleStartFailure(turnId: string, error: unknown) {
    const turn = findTurn(turnId);
    if (!isActiveTurn(turnId) || !turn) {
      return;
    }
    replaceTurn(failLiveTurn(turn, toAppErrorDto(error)));
    release();
    emit();
  }

  return {
    start(input) {
      if (isDisposed || active !== null) {
        return false;
      }
      const turnId = `live-turn-${nextTurnNumber}`;
      nextTurnNumber += 1;
      turns = [...turns, createLiveTurn(turnId, input, now())];

      const subscription = repository.startRun(input, frame =>
        handleFrame(turnId, frame)
      );
      active = {
        turnId,
        subscription,
        isCancelRequested: false,
        isCancelSent: false
      };
      subscription.runId.then(
        runId => handleRunId(turnId, runId),
        error => handleStartFailure(turnId, error)
      );
      emit();
      return true;
    },
    cancel() {
      if (isDisposed || active === null) {
        return;
      }
      active.isCancelRequested = true;
      sendCancelIfRequested();
    },
    dispose() {
      if (isDisposed) {
        return;
      }
      isDisposed = true;
      release();
    }
  };
}
