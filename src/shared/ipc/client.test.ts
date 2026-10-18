/**
 * Contract test for the shared typed `invoke` wrapper and `Channel` factory
 * (issue #16, slice 1).
 *
 * The Tauri transport is replaced with an in-memory stub so the test observes
 * the kernel's own behavior — command and args forwarding, success passthrough
 * and rejection normalization — without a running Tauri host.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const transport = vi.hoisted(() => {
  type Outcome =
    { kind: 'resolve'; value: unknown } | { kind: 'reject'; value: unknown };

  class ChannelStub {
    onmessage: ((message: unknown) => void) | null = null;
  }

  const calls: Array<{ command: string; args: unknown }> = [];
  const queue: Outcome[] = [];

  function invoke(command: string, args?: unknown): Promise<unknown> {
    calls.push({ command, args });
    const outcome = queue.shift();
    if (outcome === undefined) {
      return Promise.reject(
        new Error('ipc test transport has no queued outcome')
      );
    }
    return outcome.kind === 'resolve'
      ? Promise.resolve(outcome.value)
      : Promise.reject(outcome.value);
  }

  return { calls, queue, invoke, ChannelStub };
});

vi.mock('@tauri-apps/api/core', () => ({
  invoke: transport.invoke,
  Channel: transport.ChannelStub
}));

import { createChannel, ipcInvoke } from './client';

beforeEach(() => {
  transport.calls.length = 0;
  transport.queue.length = 0;
});

describe('ipcInvoke', () => {
  it('resolves the typed payload and forwards the command', async () => {
    transport.queue.push({ kind: 'resolve', value: [{ id: 'opencode' }] });
    await expect(
      ipcInvoke<Array<{ id: string }>>('list_providers')
    ).resolves.toEqual([{ id: 'opencode' }]);
    expect(transport.calls).toEqual([
      { command: 'list_providers', args: undefined }
    ]);
  });

  it('passes the parameterized { request } envelope through unchanged', async () => {
    transport.queue.push({ kind: 'resolve', value: { runId: 'run-1' } });
    const request = { conversationId: 'conversation-1' };
    await ipcInvoke<{ runId: string }>('start_run', { request });
    expect(transport.calls).toEqual([
      { command: 'start_run', args: { request } }
    ]);
  });

  it('rejects a raw Error as a normalized internal_error DTO', async () => {
    transport.queue.push({
      kind: 'reject',
      value: new Error('transport exploded')
    });
    await expect(ipcInvoke('list_providers')).rejects.toEqual({
      code: 'internal_error',
      message: 'transport exploded',
      retryable: false,
      requestId: ''
    });
  });

  it('rejects with a serialized AppErrorDto rejection unchanged', async () => {
    const dto = {
      code: 'permission_denied',
      message: 'path is outside the authorized workspace root',
      retryable: false,
      requestId: 'req-3b7e15d8'
    };
    transport.queue.push({ kind: 'reject', value: dto });
    await expect(ipcInvoke('read_file')).rejects.toEqual(dto);
  });
});

describe('createChannel', () => {
  it('forwards every channel message to the handler untouched', () => {
    const received: string[] = [];
    const channel = createChannel<string>(message => received.push(message));

    expect(channel).toBeInstanceOf(transport.ChannelStub);
    channel.onmessage('first');
    channel.onmessage('second');
    expect(received).toEqual(['first', 'second']);
  });
});
