/**
 * Shared typed Tauri IPC transport (issue #16, slice 1).
 *
 * Feature clients (`src/features/<feature>/api/<feature>-client.ts`) call
 * `ipcInvoke` instead of importing `invoke` directly, so command names stay
 * intent-specific, responses stay typed, and every rejection reaches hooks as a
 * normalized `AppErrorDto` (`.claude/knowledge/critical-constraints.md` §3).
 *
 * Run streams use the `createChannel` factory: a `Channel` handler is
 * registered before `start_run` is invoked so no frame is missed.
 */
import { Channel, invoke } from '@tauri-apps/api/core';
import { toAppErrorDto } from './contracts';

/**
 * Invokes one intent-driven `snake_case` command and normalizes failures.
 *
 * Resolves the typed response on success. On failure — including failures that
 * occur before the command runs — it rejects with a normalized `AppErrorDto`,
 * never a raw `Error`.
 */
export async function ipcInvoke<TResponse>(
  command: string,
  args?: Record<string, unknown>
): Promise<TResponse> {
  try {
    return await invoke<TResponse>(command, args);
  } catch (error: unknown) {
    throw toAppErrorDto(error);
  }
}

/**
 * Creates a `Channel` bound to a message handler.
 *
 * Register the returned channel with the start command (it is passed as a
 * command argument) before invoking it; messages then arrive in order through
 * `onmessage` with the stream shape owned by slice 3.
 */
export function createChannel<TMessage>(
  onMessage: (message: TMessage) => void
): Channel<TMessage> {
  const channel = new Channel<TMessage>();
  channel.onmessage = onMessage;
  return channel;
}
