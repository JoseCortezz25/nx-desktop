# Issue 23 — Connect UI to IPC: live conversation and cancel

## Objective and authority

Implement [issue #23](https://github.com/JoseCortezz25/nx-desktop/issues/23) on
branch `feat/issue-23-live-conversation-cancel`, cut from `main` at `a62182f`
(the merge of #22). Its dependencies — the `RunSupervisor` and the
`start_run`/`cancel_run`/`get_run` commands (#19) and the IPC-backed catalogs
(#22) — are merged on this base.

The #16 run contract (`run.contracts.ts`, the six-kind `RunStreamEventDto`
union) is the frozen wire shape and does not change. This issue connects the
composer and the conversation view to it: send a message, stream the response
into the conversation through the run's `Channel`, and cancel the run.

## Specs

S1. Issue #23, "What to build": send a message, stream the response into the
conversation view via the Tauri `Channel`, and cancel a run. Listener cleanup
must be idempotent.

S2. Acceptance: "Streaming renders incrementally" — every `textDelta` frame is
appended in `seq` order and the conversation view re-renders the growing reply
through its existing message rows.

S3. Acceptance: "Cancel works mid-stream" — the composer's stop control calls
`cancel_run` with the active run id and the UI ends in the `cancelled` terminal
state reported by the stream.

S4. Acceptance: "Unlisten runs exactly once on unmount" — the run subscription
is released exactly once whether the run ended, was cancelled, or is still
streaming at unmount, including StrictMode's double cleanup.

S5. Validation: automated hook tests plus manual end-to-end in the Tauri app.

## Design decisions

D1. **Mirror the #22 port pattern.** `runs/api/run-repository.ts` is the port;
`runs/api/ipc-run-repository.ts` implements it over `run-client.ts`, mapping
wire frames to domain `RunFrame`s (tool calls become domain `ToolCall`s). The
hook builds the IPC adapter; tests replace the port with an in-memory fake.

D2. **One `Channel` per run, idempotent unsubscribe.** `startRunStream` binds a
fresh channel before invoking `start_run` and returns `{ run, unsubscribe }`.
`unsubscribe` flips a guard flag (frames stop reaching the handler) and
replaces `onmessage` with a no-op; a second call returns immediately.

D3. **A framework-free session owns the subscription.**
`runs/model/live-run-session.ts` holds at most one active run. The active slot
is cleared at the moment the subscription is released — on the first terminal
frame, a `start_run` rejection, a terminal `cancel_run` reply, or `dispose` —
so no later path can release it a second time. `dispose` is itself idempotent
and stops all reporting.

D4. **Stale frames are dropped by construction and by rule.** Frames for a
turn that is no longer active, frames after `dispose`, frames of another
`runId` once the turn is bound, frames with `seq` not past the last applied one,
and anything after the first terminal frame never change the snapshot
(`runs/model/live-run.ts`, `applyRunFrame` returns the same reference).

D5. **The stream is the terminal authority.** A cancel issued before the run id
is known is remembered and sent once the first frame or the `start_run` reply
binds it; `cancel_run` is sent at most once per run. Its reply only settles a
turn whose terminal frame never arrived.

D6. **The hook creates the session inside its effect.** `useLiveRun` builds the
session in `useEffect` and disposes it in the cleanup, so a StrictMode
mount → cleanup → mount gets a fresh session and the disposed one can never
deliver a frame. Starting and cancelling are event-handler intents. Unmount
does not cancel the run — the Rust core owns it.

D7. **Presentation only in React.** The live turns (prompt, accumulated text,
tool activity, status) are ephemeral presentation state; the shell projects
them after the open conversation's persisted messages (`appendLiveTurns`). The
composer swaps send for a stop control while a run streams and keeps the draft
on a mid-stream send; the view renders a polite status line from
`runs/messages.ts`.

## Tasks

T1. `runs/model/live-run.ts` — turn model, frame reducer, projection (S2, D4).
T2. `runs/api/run-client.ts` — `startRunStream` with idempotent unsubscribe
(S1, S4, D2).
T3. `runs/api/run-repository.ts` + `ipc-run-repository.ts` — port and IPC
adapter with frame mapping (D1).
T4. `runs/model/live-run-session.ts` + `runs/hooks/use-live-run.ts` — single
owner of the subscription, cancel, dispose (S3, S4, D3, D5, D6).
T5. UI wiring — `ComposerBar` stop control, `Composer` run guard and submit
environment, `ConversationView` status line, `AppShell` start/cancel/render
(S2, S3, D7).
T6. Tests + judges — model, session, hook, repository/client, composer and shell
seam tests; `pnpm run check`, `pnpm test`, `cargo test` (S5).

## Delivery, routing and risk

- **Delivery strategy:** single feature branch; frontend-only.
- **Not in this issue:** persisting the sent prompt and the streamed reply into
  the conversation history (the Rust core does not append run output to the
  conversation yet, so live turns last for the app session); starting a run
  from Home (it needs a conversation to be created first); `get_run`
  snapshot-on-reopen; subagent cancel.
- **Risk:** a duplicate release or a post-terminal frame would corrupt the live
  view. Mitigated by clearing the active slot at release, the guard flag in the
  client subscription, and the session/hook tests that count `unsubscribe`
  calls.

## Log

L1. Branch `feat/issue-23-live-conversation-cancel` cut from `main` at
`a62182f`, which contains #19 and #22.

L2. No Rust change was needed: `start_run`, `cancel_run` and `get_run` are
registered in `generate_handler!`, and custom commands are not gated by
`capabilities/default.json` (no `AppManifest::commands` in `build.rs`).

L3. Test infrastructure: the runner is `vitest` in a node environment with no
DOM and no testing library. Hook tests therefore replace React's
`useState`/`useRef`/`useEffect` with a single-component harness (the technique
the shell seam tests already use) and model mount, re-render, unmount, double
cleanup and the StrictMode sequence. The session rules are also tested directly.

L4. Verification: `pnpm run check` (format, lint, typecheck, rust fmt, clippy),
`pnpm test` (510 frontend tests, 40 new) and `cargo test` (164 unit + 29
contract tests, unchanged) all green.

L5. Scope notes made while implementing:

- `Composer.onSubmit` now receives the resolved `RunEnvironment` with the
  prompt, because `start_run` requires it and the composer owns the
  environment popover.
- The Rust core rejects an empty `gitBranch`; when the workspace reports no
  branches the run fails with `validation_failed` and the status line shows it.
- Manual end-to-end in a desktop session was not run in this agent
  environment; the reviewer should open the seeded conversation, send a prompt,
  watch the fake runner stream, and press stop mid-stream.
