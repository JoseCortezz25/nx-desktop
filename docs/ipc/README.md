# IPC contract (`docs/ipc`)

Single source of truth for the React ↔ Rust boundary of `nx-desktop`
([issue #16](https://github.com/JoseCortezz25/nx-desktop/issues/16)). Both
languages reference this document and the machine-checkable fixtures it indexes.

## Delivery slices

Issue #16 ships as a **Feature Branch Chain**: a draft, no-merge tracker PR on
`feat/issue-16-ipc-kernel-tracker` (targeting `main`) integrates the slices, and
four child PRs carry one slice each. Child PR 1 targets the tracker branch and
each later child targets the branch of the slice before it, so no slice merges
directly into `main`. This document is filled in by each slice; **slices 1, 2 and
3 are implemented today.**

| Slice | Scope                                                       | Status      |
| ----- | ----------------------------------------------------------- | ----------- |
| 1     | Shared kernel: error contract, typed invoke, Channel factory | implemented |
| 2     | Providers / projects / conversations contracts and clients   | implemented |
| 3     | Runs / subagents contracts and the run-stream union          | implemented |
| 4     | Workspace / files / diff / hooks contracts and clients       | pending     |

Slices 2–4 append their rows to the command catalog at the end of this file.
No slice registers commands yet: they define the wire contract, the typed
clients and the Rust DTO skeletons. Command registration and the Rust services
belong to #17–#23.

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
import { createChannel } from '@/shared/ipc/client';
import { startRun } from '@/features/runs/api/run-client';
import type { RunStreamEventDto } from '@/features/runs/api/run.contracts';

// Bind the receiver first: the command starts only after `onmessage` is set.
const onEvent = createChannel<RunStreamEventDto>(event => handle(event));
const run = await startRun(request, onEvent);
```

Every stream frame carries `runId` and a monotonic `seq`; the six-kind union is
defined in `src/features/runs/api/run.contracts.ts` and documented in §6. Clean
listeners up idempotently (`unlisten`) on unmount.

## 3. Contract tests and fixtures

Fixtures live in `docs/ipc/fixtures/` and are shared by both suites. Slice 1
fixtures are error DTOs; slice 2 fixtures are command envelopes with `request`
(where the command is parameterized) and `response` members; slice 3 adds the
run and subagent envelopes plus `runs-stream-events.json`, which holds one
canonical frame per stream kind rather than a timeline.

| Fixture                                       | Pins                                                           |
| --------------------------------------------- | -------------------------------------------------------------- |
| `app-error-validation-failed.json`            | `validation_failed`, `retryable: false`                        |
| `app-error-permission-denied.json`            | `permission_denied`, `retryable: false`                        |
| `app-error-provider-unavailable.json`         | `provider_unavailable`, `retryable: true`                      |
| `app-error-cancelled.json`                    | `cancelled`, `retryable: false`                                |
| `app-error-internal-error.json`               | `internal_error`, `retryable: true`                            |
| `providers-list-providers.json`               | `ProviderDto[]` with nested `availableModels`                  |
| `providers-list-models.json`                  | `{ providerId }` → `ModelDto[]`                                |
| `projects-list-projects.json`                 | `ProjectDto[]` with approval mode and hook decisions           |
| `projects-create-project.json`                | `{ name, folders }` → `CreatedProjectDto`                      |
| `projects-set-project-approval-mode.json`     | `{ projectId, approvalMode }` → updated `ProjectDto[]`         |
| `projects-list-workspace-branches.json`       | `{ projectId }` → repository branch order                      |
| `conversations-list-conversations.json`       | `ConversationDto[]` with messages, tools and file references   |
| `conversations-create-conversation.json`      | `{ projectId, title? }` → `ConversationDto`                    |
| `runs-start-run.json`                         | `StartRunRequestDto` → `RunDto` (no `approvalMode`)            |
| `runs-cancel-run.json`                        | `{ runId }` → terminal `RunDto`                                |
| `runs-get-run.json`                           | `{ runId }` → authoritative `RunDto` snapshot                  |
| `runs-stream-events.json`                     | one canonical frame per each of the six `RunStreamEventDto` kinds |
| `subagents-list-subagents.json`               | `{ runId }` → `SubagentDto[]`                                  |
| `subagents-cancel-subagent.json`              | `{ runId, subagentId }` → stopped `SubagentDto`               |

- TypeScript: `src/shared/ipc/contracts.test.ts` and `src/shared/ipc/client.test.ts`
  (`pnpm test`), plus one `src/features/<feature>/api/*.test.ts` per slice-2
  feature. Each compares the fixture against a typed literal and stubs
  `ipcInvoke` to pin the command name and envelope.
- Rust: `src-tauri/tests/ipc_contract.rs` (`cargo test`), which serializes and
  deserializes each fixture through its DTO and rejects unknown request fields.

Because both sides read the same JSON, a `request_id` vs `requestId` mismatch, a
renamed DTO field, or a drifted enum value fails deterministically at test time.

## 4. Command catalog

Each command that lands in slices 2–4 adds one row and one request/response
fixture. Columns: **command** (`snake_case`), **request**, **response**,
**errors**, **authority**, **owning ticket**.

| Command                     | Request                            | Response             | Errors                                                        | Authority                                    | Ticket |
| --------------------------- | ---------------------------------- | -------------------- | ------------------------------------------------------------- | -------------------------------------------- | ------ |
| `list_providers`            | —                                  | `ProviderDto[]`      | `provider_unavailable`, `internal_error`                      | —                                            | #17    |
| `list_models`               | `{ providerId }`                   | `ModelDto[]`         | `validation_failed`, `provider_unavailable`                   | provider belongs to the configured registry  | #17    |
| `list_projects`             | —                                  | `ProjectDto[]`       | `internal_error`                                              | —                                            | #18    |
| `create_project`            | `{ name, folders }`                | `CreatedProjectDto`  | `validation_failed`, `permission_denied`                      | folders become authorized workspace roots    | #18    |
| `set_project_approval_mode` | `{ projectId, approvalMode }`      | `ProjectDto[]`       | `validation_failed`, `permission_denied`                      | `projectId` must be a known project          | #18    |
| `list_workspace_branches`   | `{ projectId }`                    | `string[]`           | `permission_denied`, `internal_error`                         | `projectId` + canonicalized workspace roots  | #18    |
| `list_conversations`        | —                                  | `ConversationDto[]`  | `internal_error`                                              | —                                            | #18    |
| `create_conversation`       | `{ projectId, title? }`            | `ConversationDto`    | `validation_failed`, `permission_denied`                      | `projectId` must be a known project          | #18    |
| `start_run`                 | `{ request, onEvent: Channel<RunStreamEventDto> }` | `RunDto` | `validation_failed`, `permission_denied`, `provider_unavailable`, `internal_error` | `projectId` (policy + roots); `conversationId` parent | #19    |
| `cancel_run`                | `{ runId }`                        | `RunDto`             | `validation_failed`, `permission_denied`, `internal_error`    | `runId` is the authority token               | #19    |
| `get_run`                   | `{ runId }`                        | `RunDto`             | `validation_failed`, `permission_denied`, `internal_error`    | `runId` is the authority token               | #19    |
| `list_subagents`            | `{ runId }`                        | `SubagentDto[]`      | `validation_failed`, `permission_denied`, `internal_error`    | `runId` is the parent run context            | #19/#23 (open) |
| `cancel_subagent`           | `{ runId, subagentId }`            | `SubagentDto`        | `validation_failed`, `permission_denied`, `internal_error`    | `runId` + `subagentId` both authority-bearing | #19/#23 (open) |

Parameterless commands take no `args`; every parameterized command passes a
named `{ request }` envelope (`docs/research-tecnico/arquitectura-tauri.md`).
Slices 2–3 define the contract only — the rows above register no command until
#17–#23 implement the services and `generate_handler!`.

## 5. Feature catalogs (slice 2)

Wire shapes are `camelCase`; the Rust structs keep `snake_case` fields. Closed
enums serialize with `snake_case` values that match the TypeScript domain unions.

### `ProviderDto` / `ModelDto`

| Field                    | Type                    | Meaning                                                    |
| ------------------------ | ----------------------- | ---------------------------------------------------------- |
| `id`                     | `string`                | Provider id (`opencode`, `codex`, `claude`).               |
| `displayName`            | `string`                | Provider name drawn in the composer selector.              |
| `icon`                   | `string`                | Icon key resolved by the UI, never a hardcoded asset path. |
| `subtitle`               | `string`                | Short provider descriptor.                                 |
| `availableModels`        | `ModelDto[]`            | Models this provider exposes.                              |
| `ModelDto.id`            | `string`                | Model id, unique within its provider.                      |
| `ModelDto.providerId`    | `string`                | Parent provider id; models are provider-scoped.            |
| `ModelDto.supportedEffortLevels` | `string[]`      | Effort stops the model exposes.                            |

**`provider → model → effort` invariant.** A model belongs to exactly one
provider and the effort stops come from that provider/model pair
(`.claude/knowledge/business-logic.md` §3.1). This contract documents the
invariant and the request shape; **enforcement is deferred to the Rust service
in #17** (`Shape` → `Limits` → `Invariants` → `Authority`). No client may assume
a cross-provider model id is valid.

### `ProjectDto` and its requests

| Field               | Type                 | Meaning                                                              |
| ------------------- | -------------------- | -------------------------------------------------------------------- |
| `id`                | `string`             | Project id.                                                          |
| `name`              | `string`             | Project name.                                                        |
| `workspaceFolders`  | `string[]`           | Authorized local workspace roots.                                    |
| `approvalMode`      | `ApprovalMode`       | `ask_always` \| `auto_approve` \| `full_access`, project-scoped.     |
| `hookDecisions`     | `HookDecisionDto[]`  | One `{ hookId, approvalStatus }` per reviewed hook.                  |
| `conversationIds`   | `string[]`           | Conversations owned by the conversations module.                     |
| `CreatedProjectDto` | `{ project, projects }` | The created row plus the updated catalog.                         |

- `create_project` sends `{ request: { name, folders } }`; the core decides the
  id and the defaults, so the client never invents one.
- `set_project_approval_mode` and `list_workspace_branches` send
  `{ request: { projectId, ... } }`. The `projectId` is **authority-bearing**:
  Rust resolves it to the project's canonicalized workspace roots before any
  filesystem access (`.claude/knowledge/business-logic.md` §3.3).

### `ConversationDto`

| Field            | Type                       | Meaning                                             |
| ---------------- | -------------------------- | --------------------------------------------------- |
| `id`             | `string`                   | Conversation id.                                    |
| `projectId`      | `string`                   | Owning project; authority-bearing.                  |
| `title`          | `string`                   | Conversation title.                                 |
| `messages`       | `ConversationMessageDto[]` | Turns, oldest first.                                |
| `isPinned`       | `boolean`                  | Drives the sidebar pinned group.                    |
| `createdAt` / `updatedAt` | `string`           | ISO-8601 timestamps.                                |
| `role`           | `user` \| `assistant` \| `system` | Author of a message.                        |
| `toolCalls`      | `ToolCallDto[]`            | Tool activity surfaced in the message.              |
| `fileReferences` | `FileReferenceDto[]?`      | Inline file chips; omitted when empty.              |

`create_conversation` sends `{ request: { projectId, title? } }`; when `title`
is absent the core derives one, so the request stays valid without inventing UI
copy. `ToolCallDto.subagentId` is present only for `kind: "subagent"`.

### Exact wire examples

These are excerpts of the byte-exact fixtures; both suites consume the files.

`projects-create-project.json` (request)

```json
{
  "request": {
    "name": "Docs site",
    "folders": ["/workspace/docs-site"]
  }
}
```

`projects-set-project-approval-mode.json` (request)

```json
{
  "request": {
    "projectId": "proj-design-system",
    "approvalMode": "full_access"
  }
}
```

`conversations-create-conversation.json` (request)

```json
{
  "request": {
    "projectId": "proj-design-system",
    "title": "IPC contract review"
  }
}
```

## 6. Feature catalogs (slice 3)

Runs and subagents are contract-only here. `RunSupervisor`, the services, the
commands and the stream emission belong to #19; the subagent list and individual
stop have an **open downstream owner (#19/#23)**, and this slice invents no
lifecycle behavior for them.

### `RunDto`, `RunEnvironmentDto` and `RunStatus`

| Field             | Type        | Meaning                                                              |
| ----------------- | ----------- | -------------------------------------------------------------------- |
| `runId`           | `string`    | Run identity owned by the Rust supervisor.                           |
| `conversationId`  | `string`    | Parent conversation; a failed/cancelled run never deletes it (§3.2). |
| `projectId`       | `string`    | Authorizing project; authority-bearing.                              |
| `status`          | `RunStatus` | Closed lifecycle state; #19 owns the transitions.                    |
| `useNewWorktree`  | `boolean`   | `RunEnvironmentDto`: fresh worktree instead of the checkout.         |
| `gitBranch`       | `string`    | Branch picked from `list_workspace_branches`.                        |
| `environmentName` | `string`    | Named environment, if any.                                           |

`RunStatus` is exactly `pending | streaming | completed | failed | cancelled`.
`started` is a **frame kind**, not a status: a run that emitted `started` is
`streaming`, and it is `pending` before the first frame.

`start_run` sends `{ request, onEvent }`. The request carries `conversationId`,
`projectId`, `providerId`, `modelId`, `effortLevel`, `prompt` and `environment`
— and deliberately **no `approvalMode`**: the tool approval policy is
project-scoped and resolved in the Rust core, never trusted from the UI
(`.opencode/knowledge/critical-constraints.md` §7). `projectId` is the authority
anchor for that policy and the workspace roots; #19 enforces the invariant
`conversation.projectId == projectId`.

`get_run(runId)` is the **authoritative snapshot on reopen**
(`.opencode/knowledge/architecture-patterns.md` §4): a remounted panel queries it
instead of trusting buffered deltas. The richer snapshot payload (accumulated
text and tool activity) is a #19 decision, not invented here.

`cancel_run` is idempotent in the core and resolves the authoritative terminal
`RunDto`; `runId` is the authority token. A `completed`/`failed`/`cancelled`
race must resolve to exactly one terminal state in the supervisor (§3.2).

### `SubagentDto`

| Field         | Type                                                    | Meaning                                        |
| ------------- | ------------------------------------------------------- | ---------------------------------------------- |
| `id`          | `string`                                                | `SubagentId`.                                  |
| `name`        | `string`                                                | Display name.                                  |
| `avatar`      | `string`                                                | Portable presentation key, not an asset path.   |
| `status`      | `processing` \| `finished` \| `failed` \| `cancelled`   | Flat wire form of the four-state domain union. |
| `elapsedMs`   | `number`                                                | Frozen when the subagent leaves `processing`.  |
| `modelId`     | `string`                                                | Child selection-chain model.                   |
| `effortLevel` | `string`                                                | Child effort stop from the provider catalog.   |
| `transcript`  | `ConversationMessageDto[]`                              | The child run's own transcript, oldest first.  |

`list_subagents` sends `{ runId }`; `cancel_subagent` sends
`{ runId, subagentId }`. Both ids are authority-bearing: the core resolves the
child run within its parent and rejects a subagent from another run.
`cancel_subagent` resolves that subagent to `cancelled` **without** cancelling
the parent run (§3.2). **Owner is open**: the Explorer flagged that #19's
acceptance names only `start_run`/`cancel_run` and `use-subagent-catalog.ts`
defers the stop to "`cancel_run`'s child scope"; this contract defines the
intent-driven command the primary rules call for
(`.opencode/knowledge/critical-constraints.md` §4) without choosing between #19
and #23 as the implementer.

### `RunStreamEventDto` — the closed six-kind union

Internally tagged by `kind`; every frame carries `runId` and a monotonic `seq`
so a consumer can order frames and drop stale ones.

| `kind`         | Extra payload           | Meaning                                                           |
| -------------- | ----------------------- | ----------------------------------------------------------------- |
| `started`      | —                       | The run began; its status is now `streaming`.                     |
| `textDelta`    | `text: string`          | A bounded chunk of assistant text.                                |
| `toolActivity` | `toolCall: ToolCallDto` | Tool activity; the same wire shape a conversation message embeds. |
| `completed`    | —                       | Terminal success.                                                 |
| `failed`       | `error: AppErrorDto`    | Terminal failure with the public error contract.                  |
| `cancelled`    | —                       | Terminal cancellation via `cancel_run`.                           |

**`hookReviewRequired` amendment question.** `business-logic.md` §3.2 names a
`hookReviewRequired` frame mid-stream, but the normative set is the six kinds in
`.claude/rules/ipc-and-contracts.md` §5 and
`.opencode/skills/tauri-ipc-command/SKILL.md`. This slice follows the normative
six. If #20 needs a push frame for hook review it must amend this contract and
its fixtures; #16 must not invent a seventh variant (Explorer finding, issue
#16).

### Shared shapes across features

The `toolActivity` frame carries `ToolCallDto` and a subagent's `transcript`
carries `ConversationMessageDto`, both from
`src/features/conversations/api/conversation.contracts.ts` (Rust:
`src-tauri/src/features/conversations/dto.rs`). They are **type-only** imports
of one product entity's wire shape, so the run stream and the conversation
history can never disagree; the alternative — a second copy in `runs` /
`subagents` — would drift and the shared fixtures would not catch it
(`docs/research-tecnico/arquitectura-tauri.md`, "Estructura de archivos").

### Exact wire examples

These are excerpts of the byte-exact fixtures; both suites consume the files.

`runs-start-run.json` (request)

```json
{
  "request": {
    "conversationId": "conv-composer-chain",
    "projectId": "proj-design-system",
    "providerId": "opencode",
    "modelId": "deepseek-v3.1",
    "effortLevel": "high",
    "prompt": "Reconcile the provider, model, and effort selectors.",
    "environment": {
      "useNewWorktree": false,
      "gitBranch": "main",
      "environmentName": "local"
    }
  }
}
```

`runs-stream-events.json` (one frame per kind; `textDelta` and `failed` shown)

```json
{
  "kind": "textDelta",
  "runId": "run-7f2a9c10",
  "seq": 2,
  "text": "Reconciling the provider, model, and effort selectors."
}
```

```json
{
  "kind": "failed",
  "runId": "run-7f2a9c10",
  "seq": 5,
  "error": {
    "code": "provider_unavailable",
    "message": "provider adapter did not respond before the timeout",
    "retryable": true,
    "requestId": "req-6c02f7a1"
  }
}
```

## 7. Adding a command (slice 4)

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
