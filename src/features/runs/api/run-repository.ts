/**
 * Port for starting, streaming and cancelling runs (issue #23).
 *
 * The live-run session depends on this seam instead of the IPC client, so its
 * frame and cleanup rules are tested with an in-memory fake; the IPC-backed
 * adapter (`ipc-run-repository.ts`) implements it at runtime.
 */
import type { LiveRunStatus, RunFrame, StartRunInput } from '../model/live-run';

/** One started run's subscription; `unsubscribe` is idempotent. */
export interface RunSubscription {
  /** Resolves the run id the core assigned (the `start_run` reply). */
  readonly runId: Promise<string>;
  unsubscribe(): void;
}

export interface RunRepository {
  /** Binds `onFrame` before the run starts, then starts it. */
  startRun(
    input: StartRunInput,
    onFrame: (frame: RunFrame) => void
  ): RunSubscription;
  /** Requests cancellation; resolves the authoritative status afterwards. */
  cancelRun(runId: string): Promise<LiveRunStatus>;
}
