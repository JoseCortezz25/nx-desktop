# IPC contract (`docs/ipc`)

Single source of truth for the React ↔ Rust boundary of `nx-desktop`
([issue #16](https://github.com/JoseCortezz25/nx-desktop/issues/16)). Both
languages reference this document and the machine-checkable fixtures it indexes.

## Delivery slices

Issue #16 ships as four chained PRs (stacked-to-main). This document is filled in
by each slice; **only slice 1 is implemented today.**

| Slice | Scope                                                       | Status      |
| ----- | ----------------------------------------------------------- | ----------- |
| 1     | Shared kernel: error contract, typed invoke, Channel factory | implemented |
| 2     | Providers / projects / conversations contracts and clients   | pending     |
| 3     | Runs / subagents contracts and the run-stream union          | pending     |
| 4     | Workspace / files / diff / hooks contracts and clients       | pending     |

The command catalog at the end of this file is appended by slices 2–4 as their
DTOs land; slice 1 registers no commands.

## 1. Public error contract (`AppErrorDto`)

Every Tauri command returns `Result<TDto, AppErrorDto>`. A rejected `invoke()`
promise is therefore **not** guaranteed to be a JavaScript `Error`; the shared
client normalizes it before hooks or UI components see it
(`.claude/rules/ipc-and-contracts.md` §4).

Wire shape (`camelCase`; the Rust struct keeps `snake_case` fields):

| Field       | Type                              | Meaning                                                                                                                                  |
| ----------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `code`      | `AppErrorCode` (closed set)       | Stable error identifier.                                                                                                                 |
| `message`   | `string`                          | Safe diagnostic summary. Never a secret, raw provider error or stack trace. The UI resolves its display copy from `code`, not this field. |
| `retryable` | `boolean`                         | Whether the same intent may be retried.                                                                                                  |
| `requestId` | `string`                          | Rust correlation id; empty when the failure predates the command.                                                                        |

The closed code set is exactly the keys of `sharedMessages.errors`
(`src/shared/i18n/messages.ts`) and is defined once per side:

- TypeScript: `appErrorCodes` / `AppErrorCode` in `src/shared/ipc/contracts.ts`.
- Rust: `AppErrorCode` in `src-tauri/src/ipc/error.rs`
  (`#[serde(rename_all = "snake_case")]`).

| Code                   | Default `retryable` | Raised when                                                        |
| ---------------------- | ------------------- | ------------------------------------------------------------------ |
| `validation_failed`    | `false`             | Shape / Limits / Invariants validation fails.                      |
| `permission_denied`    | `false`             | Authority validation fails (workspace path or approval policy).    |
| `provider_unavailable` | `true`              | The selected provider adapter is unavailable or timed out.         |
| `cancelled`            | `false`             | The run or operation was cancelled.                                |
| `internal_error`       | `true`              | An unexpected failure with no safer public classification.         |

### Exact wire examples

These are the fixtures under `docs/ipc/fixtures/`, byte-for-byte. Both test
suites consume the same files.

`app-error-validation-failed.json`

```json
{
  "code": "validation_failed",
  "message": "prompt exceeds the maximum accepted size",
  "retryable": false,
  "requestId": "req-9f1c4a20"
}
```

`app-error-permission-denied.json`

```json
{
  "code": "permission_denied",
  "message": "path is outside the authorized workspace root",
  "retryable": false,
  "requestId": "req-3b7e15d8"
}
```

`app-error-provider-unavailable.json`

```json
{
  "code": "provider_unavailable",
  "message": "provider adapter did not respond before the timeout",
  "retryable": true,
  "requestId": "req-6c02f7a1"
}
```

`app-error-cancelled.json`

```json
{
  "code": "cancelled",
  "message": "run cancelled by user request",
  "retryable": false,
  "requestId": "req-a4d18e6b"
}
```

`app-error-internal-error.json`

```json
{
  "code": "internal_error",
  "message": "unexpected internal error",
  "retryable": true,
  "requestId": "req-e8f3b907"
}
```

## 2. Typed transport (`src/shared/ipc/client.ts`)

Feature clients call `ipcInvoke` instead of importing `invoke` directly, so
command names stay intent-specific and rejections arrive normalized:

```ts
import { ipcInvoke } from '@/shared/ipc/client';

export function listProviders(): Promise<ProviderDto[]> {
  return ipcInvoke<ProviderDto[]>('list_providers');
}
```

- `ipcInvoke<TResponse>(command, args?)` resolves the typed response, or rejects
  with an `AppErrorDto` — never a raw `Error`. A parameterized command passes its
  named envelope as `args` (for example `{ request }`, per
  `docs/research-tecnico/arquitectura-tauri.md`).
- `toAppErrorDto(unknown)` / `isAppErrorDto(unknown)` normalize and narrow any
  rejection value. A valid DTO passes through; anything else becomes
  `internal_error` with `retryable: false` and an empty `requestId`.
- `isAppErrorCode(unknown)` narrows a single code.

### Streaming with `Channel`

High-frequency run output uses a `Channel`, not global events
(`.claude/knowledge/critical-constraints.md` §8). **Register the channel before
invoking the command** so no frame is missed:

```ts
import { createChannel, ipcInvoke } from '@/shared/ipc/client';

const onEvent = createChannel<RunStreamEventDto>(event => handle(event));
const run = await ipcInvoke<RunDto>('start_run', { request, onEvent });
```

Every stream frame carries `runId` and a monotonic `seq`; the six-kind union is
owned by slice 3. Clean listeners up idempotently (`unlisten`) on unmount.

## 3. Contract tests and fixtures

Fixtures live in `docs/ipc/fixtures/` and are shared by both suites:

| Fixture                                     | Pins                                                |
| ------------------------------------------- | --------------------------------------------------- |
| `app-error-validation-failed.json`          | `validation_failed`, `retryable: false`             |
| `app-error-permission-denied.json`          | `permission_denied`, `retryable: false`             |
| `app-error-provider-unavailable.json`       | `provider_unavailable`, `retryable: true`           |
| `app-error-cancelled.json`                  | `cancelled`, `retryable: false`                     |
| `app-error-internal-error.json`             | `internal_error`, `retryable: true`                 |

- TypeScript: `src/shared/ipc/contracts.test.ts` and `src/shared/ipc/client.test.ts`
  (`pnpm test`).
- Rust: `src-tauri/tests/ipc_contract.rs` (`cargo test`), which serializes and
  deserializes each fixture through `AppErrorDto`.

Because both sides read the same JSON, a `request_id` vs `requestId` mismatch or
a renamed code fails deterministically at test time.

## 4. Command catalog

Each command that lands in slices 2–4 adds one row and one request/response
fixture. Columns: **command** (`snake_case`), **request**, **response**,
**errors**, **authority**, **owning ticket**.

| Command | Request | Response | Errors | Authority | Ticket |
| ------- | ------- | -------- | ------ | --------- | ------ |
| _(none yet — slice 1 is the shared kernel)_ | | | | | |

### Adding a command (slices 2–4)

1. Define the `camelCase` request/response DTO and its fixture in
   `docs/ipc/fixtures/`.
2. Add the typed client in `src/features/<feature>/api/<feature>-client.ts` via
   `ipcInvoke`, and its contract test.
3. Add the Rust DTO in `src-tauri/src/features/<feature>/dto.rs` with
   `#[serde(rename_all = "camelCase")]` and a serde round-trip test against the
   same fixture.
4. Implement the command, validate Shape / Limits / Invariants / Authority, and
   return `Result<TDto, AppErrorDto>`.
5. Register it in `generate_handler!` and add row + fixture index entry here.
