/**
 * Live conversation run (issue #23): send a prompt, render its stream, cancel.
 *
 * The hook is the React seam over one `LiveRunSession`. The session is created
 * inside the effect and disposed by its cleanup, so a StrictMode
 * mount → cleanup → mount gets a fresh session and the disposed one can never
 * deliver a frame. `dispose` is idempotent and releases the run subscription
 * exactly once, whether the run already ended, was cancelled, or is still
 * streaming at unmount. Unmounting does not cancel the run: the Rust core owns
 * it (`.claude/rules/state-and-concurrency.md` §3.4).
 *
 * Starting and cancelling are event-handler intents; the effect only owns the
 * subscription lifetime.
 */
import { useEffect, useRef, useState } from 'react';
import { createIpcRunRepository } from '../api/ipc-run-repository';
import type { LiveTurn, StartRunInput } from '../model/live-run';
import {
  createLiveRunSession,
  EMPTY_LIVE_RUN_SNAPSHOT,
  type LiveRunSession,
  type LiveRunSnapshot
} from '../model/live-run-session';

export interface LiveRunState {
  readonly turns: readonly LiveTurn[];
  /** `true` while a run streams; the composer swaps send for cancel. */
  readonly isRunning: boolean;
  /** Starts a run; returns `false` when one is already active. */
  readonly startRun: (input: StartRunInput) => boolean;
  readonly cancelRun: () => void;
}

export function useLiveRun(): LiveRunState {
  const [snapshot, setSnapshot] = useState<LiveRunSnapshot>(
    EMPTY_LIVE_RUN_SNAPSHOT
  );
  const sessionRef = useRef<LiveRunSession | null>(null);

  useEffect(() => {
    const session = createLiveRunSession({
      repository: createIpcRunRepository(),
      onChange: setSnapshot,
      now: () => new Date().toISOString()
    });
    sessionRef.current = session;

    return () => {
      session.dispose();
      if (sessionRef.current === session) {
        sessionRef.current = null;
      }
    };
  }, []);

  function startRun(input: StartRunInput): boolean {
    return sessionRef.current?.start(input) ?? false;
  }

  function cancelRun() {
    sessionRef.current?.cancel();
  }

  return {
    turns: snapshot.turns,
    isRunning: snapshot.isRunning,
    startRun,
    cancelRun
  };
}
