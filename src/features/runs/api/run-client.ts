/**
 * Typed IPC client for runs and the run stream (issue #16, slice 3).
 *
 * Commands are intent-driven `snake_case`; parameterized calls pass the
 * `{ request }` envelope documented in `docs/ipc/README.md`. `start_run` also
 * carries the `onEvent` `Channel`, which the caller binds **before** invoking
 * so no frame is missed (`.claude/rules/ipc-and-contracts.md` §5). The
 * `RunSupervisor`, service and command registration landed in #19;
 * `startRunStream` (#23) is the subscription the live conversation consumes.
 */
import type { Channel } from '@tauri-apps/api/core';
import { createChannel, ipcInvoke } from '@/shared/ipc/client';
import type {
  CancelRunRequestDto,
  GetRunRequestDto,
  RunDto,
  RunStreamEventDto,
  StartRunRequestDto
} from './run.contracts';

/**
 * Starts a run and streams its frames through `onEvent`.
 *
 * The caller creates and binds the channel first — for example with
 * `createChannel<RunStreamEventDto>(handle)` — and passes it here, so the
 * command starts only after the receiver is registered. Resolves the created
 * run's initial snapshot; per-frame ordering is `seq`.
 */
export function startRun(
  request: StartRunRequestDto,
  onEvent: Channel<RunStreamEventDto>
): Promise<RunDto> {
  return ipcInvoke<RunDto>('start_run', { request, onEvent });
}

/**
 * A live subscription to one run's stream, owned by whoever started it.
 *
 * `run` is the `start_run` reply (the pending snapshot). `unsubscribe` detaches
 * the frame handler and is idempotent: the first call detaches, every later
 * call is a no-op, so a StrictMode double cleanup, an unmount after the
 * terminal frame or a cancel followed by unmount never double-detach.
 */
export interface RunStreamSubscription {
  readonly run: Promise<RunDto>;
  unsubscribe(): void;
}

/**
 * Binds a fresh `Channel` to `onFrame`, then starts the run with it.
 *
 * One channel per run: a frame arriving on it belongs to this run by
 * construction, and nothing reaches `onFrame` after `unsubscribe`.
 */
export function startRunStream(
  request: StartRunRequestDto,
  onFrame: (frame: RunStreamEventDto) => void
): RunStreamSubscription {
  let isSubscribed = true;
  const channel = createChannel<RunStreamEventDto>(frame => {
    if (isSubscribed) {
      onFrame(frame);
    }
  });

  return {
    run: startRun(request, channel),
    unsubscribe() {
      if (!isSubscribed) {
        return;
      }
      isSubscribed = false;
      // Release the handler so a late frame cannot reach a closed closure.
      channel.onmessage = () => {};
    }
  };
}

/**
 * Cancels a run and resolves its authoritative terminal snapshot.
 *
 * The core makes cancellation idempotent and propagates it to the adapter; the
 * client only names the run (`runId` is the authority token).
 */
export function cancelRun(runId: string): Promise<RunDto> {
  const request: CancelRunRequestDto = { runId };
  return ipcInvoke<RunDto>('cancel_run', { request });
}

/** Reads the authoritative run snapshot; used when a panel reopens. */
export function getRun(runId: string): Promise<RunDto> {
  const request: GetRunRequestDto = { runId };
  return ipcInvoke<RunDto>('get_run', { request });
}
