# Issue 19 — Rust: RunSupervisor, start_run, cancel_run and Channel streaming

## Objective and authority

Implement [issue #19](https://github.com/JoseCortezz25/nx-desktop/issues/19) on
branch `feat/issue-19-run-supervisor`, cut from `main` at `19b2126` (the merge
of #18). Blocked by #17, which is CLOSED and present on this base, so the
blocker is resolved.

The #16 contract (`runs/dto.rs`, `docs/ipc/fixtures/runs-*.json`, the TypeScript
client `src/features/runs/api/run-client.ts`) is the frozen wire shape. This
issue adds the Rust domain, the `RunSupervisor`, the service, the fake runner,
the three commands and their registration — no frontend changes (the TS client
already exists and stays untouched), no real provider process (that is
#25–#27), and no subagent control (still owned by the open #19/#23 question in
`docs/ipc/README.md` §6).

## Specs

S1. Issue #19, "What to build": "`RunSupervisor` owns active runs. `start_run`
streams events over a `Channel` from the fake provider; `cancel_run` propagates
cancellation."

S2. Acceptance criterion: "Run lifecycle transitions match `business-logic.md`"
— `pending → streaming → completed | failed | cancelled`, with `started` as a
frame kind (not a status), one authoritative terminal state, and a failed or
cancelled run leaving its conversation intact.

S3. Acceptance criterion: "Cancel stops the stream and frees resources" —
`cancel_run` is idempotent, signals the adapter through a cancellation token,
emits exactly one `cancelled` terminal frame, drops the channel sink and lets
the driver task finish. Completion-vs-cancellation resolves under one lock in
the supervisor.

S4. Acceptance criterion: "No lock held across `.await`" — the supervisor map
lock is held only to insert/lookup; the per-run status lock only to allocate a
sequence number and emit (non-blocking `Channel::send`); the adapter is always
awaited with no guard alive.

S5. Acceptance criterion: "Follows the feature layout and the IPC contract
ticket" — `runs/{domain,ports,service,commands}.rs`, `runs/supervisor.rs`,
`runs/adapters/fake.rs`; DTOs in `dto.rs` stay untouched; `start_run` accepts
`{ request, onEvent }` and returns the pending `RunDto`; `cancel_run`/`get_run`
return the authoritative snapshot; all three registered in `generate_handler!`.

S6. Acceptance criterion: "No `.unwrap()` on fallible paths" — errors propagate
with `?` into `RunError` → `AppErrorDto`; the only fallback helpers are static
format strings, documented as unreachable.

S7. Acceptance criterion: "`cargo test`, `cargo clippy -D warnings` and
`cargo fmt --check` pass" — domain limits, supervisor lifecycle/cancellation
races, service authority, command error mapping and the stream-frame fixture.

## Design decisions

D1. **Supervisor is Tauri-free.** `RunSupervisor` emits domain `RunFrame`s
through the `RunEventSink` port; `commands.rs` adapts a `Channel<RunStreamEventDto>`
to that port and maps `RunEvent` → wire union. Tests drive the supervisor
without a webview.

D2. **One driver future per run.** `start` inserts the run and returns the
`StartedRun { snapshot, driver }`; the command spawns the driver on Tauri's
runtime, tests spawn it on Tokio. No `tauri::async_runtime` inside the service.

D3. **First terminal state wins.** Status changes happen under the per-run
lock; `claim_terminal` refuses a second transition and takes the sink, so
exactly one terminal frame is emitted and no progress frame can follow it.

D4. **Fake runner is scaffolding.** `FakeAgentRunner` streams deterministic
word chunks plus one tool activity and honours cancellation between chunks; it
belongs to `runs/adapters`, not to the provider catalog (#17 stays catalog-only).

## Tasks

T1. `runs/domain.rs` — `RunId`, `RunPrompt`, `RunEnvironment`, `StartRunSpec`,
`RunStatus`, `RunEvent`, `RunFrame`, `RunSnapshot`, `RunFailure`, `RunError`
(S1, S2, S5).
T2. `runs/ports.rs` — `AgentRunner`, `RunProgressSink`, `RunEventSink`,
`Cancellation`, `RunExecutionRequest` (S3, S4, D1).
T3. `runs/adapters/fake.rs` — deterministic streaming fake honouring
cancellation (S1, D4).
T4. `runs/supervisor.rs` — active-run map, sequence numbers, lifecycle
transitions, idempotent cancellation, terminal arbitration (S2, S3, S4, D3).
T5. `runs/service.rs` — conversation/project authority, selection-chain
invariants, prompt/environment limits, start delegation (S2, S5).
T6. `runs/commands.rs` + `lib.rs` — `start_run`, `cancel_run`, `get_run`,
`Channel` adapter, DTO/error mapping, `generate_handler!` registration (S5, S6).
T7. Tests + judges — supervisor lifecycle/race matrix, service rejection
matrix, command fixture/shape tests, then `cargo test`,
`cargo clippy -- -D warnings`, `cargo fmt --check` (S7).

## Delivery, routing and risk

- **Delivery strategy:** single feature branch, one backend ticket.
- **Not in this issue:** real provider processes (#25–#27), subagent
  `list`/`cancel` (open owner #19/#23), text/tool accumulation in the
  `get_run` snapshot (the contract keeps the four-field `RunDto`), and any
  frontend wiring.
- **Risk:** terminal-state arbitration (a duplicate or post-terminal frame
  corrupts the UI's live view) and lock hygiene (a guard across the adapter
  await would deadlock `cancel_run`). Mitigated by the supervisor race tests
  and by keeping the adapter behind a Tauri-free port.

## Log

L1. User request verbatim: "Ayudame a tratar la issue 19 en una nueva rama y con
base a la 18".

L2. Branch `feat/issue-19-run-supervisor` cut from `main` at `19b2126`, which
already contains the #18 merge and therefore the project/conversation stores and
the workspace path policy this ticket reuses.

L3. Delivered in three commits:

| Slice | Commit    | Files                                                                    | Authored lines |
| ----- | --------- | ------------------------------------------------------------------------ | -------------- |
| 1     | `04f1f12` | `runs/{mod,domain,ports,supervisor}.rs`, `runs/adapters/*`               | ~1,357         |
| 2     | `f304033` | `runs/{mod,service,commands}.rs`, `conversations/*`, `lib.rs`, `Cargo.*` | ~820           |
| 3     | `fce2098` | `odd/tasks/issue-19-*.md`, `docs/ipc/README.md`                          | ~119           |

L4. Verification: `cargo test` (94 unit + 29 contract tests), `cargo clippy
--all-targets -- -D warnings`, `cargo fmt --check`, `pnpm run check` (format,
lint, typecheck, rust fmt, clippy) and `pnpm test` (461 frontend tests) all
green. The run fixtures stay byte-for-byte in `src-tauri/tests/ipc_contract.rs`;
the new stream-frame test pins the command projection against
`runs-stream-events.json`.

L5. Scope corrections made while implementing: start-run Authority is the
project plus the conversation parent (no conversation mutation and no branch
membership gate, matching the `docs/ipc/README.md` §4 authority column); an
empty `environmentName` is accepted because the contract describes it as "if
any". Real git branch discovery and worktree materialization remain outside
this ticket.
