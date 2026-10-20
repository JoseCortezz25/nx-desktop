# Issue 20 — Rust: approval policy and PreToolUse hooks

## Objective and authority

Implement [issue #20](https://github.com/JoseCortezz25/nx-desktop/issues/20) on
branch `feat/issue-20-approval-policy-hooks`, cut from `main` at `f978324` (the
merge of #19). Issue #20 is blocked by #19, which is CLOSED and present on this
base, so the blocker is resolved.

The #16 contract (`hooks/dto.rs`, `docs/ipc/fixtures/hooks-*.json`, the
TypeScript clients) is the frozen wire shape. This issue adds the Rust hook
domain, the approval-policy engine, the hook source/executor ports, the
`list_hooks` / `set_hook_decision` commands and a real `PreToolUse` process
executor — no frontend changes (the clients already exist and stay untouched)
and no interactive tool-approval round-trip (the contract has no command for it;
#21 and #25–#27 consume the core policy).

## Specs

S1. Issue #20, "What to build": core-enforced approval modes (`ask_always`,
`auto_approve`, `full_access`) and hook execution/listing (`PreToolUse`), with
authority in Rust, never in UI hiding alone.

S2. Acceptance criterion: "Each approval mode gates tool calls as specified" —
the policy engine maps a `ToolCallKind` to `allow` or `require_approval` under
the project's mode, with the conservative reading of "safe/scoped tools"
documented below.

S3. Acceptance criterion: "Hooks listed with origin, type, command and timeout"
— `list_hooks` returns the `HookDto` fixture shape for a known project and
merges the project's decisions; `set_hook_decision` records the project-scoped
status and returns the updated hook.

S4. Acceptance criterion: "Open question on disallowed hooks is documented, not
guessed" — declined hooks are recorded and **never executed**; whether declining
must also block the guarded tool call is not specified anywhere, so this ticket
documents the question in `business-logic.md` §4 and the task log instead of
inventing blocking behaviour.

S5. Acceptance criterion: "Follows the feature layout and the IPC contract
ticket" — `hooks/{domain,ports,service,commands}.rs`, `hooks/approval_policy.rs`,
`hooks/adapters/{fake,process}.rs`; DTOs in `dto.rs` stay untouched; both
commands are registered in `generate_handler!`.

S6. Acceptance criterion: "No `.unwrap()` on fallible paths; no `MutexGuard`
held across `.await`" — errors propagate with `?` into `HookError` →
`AppErrorDto`; the service clones the project snapshot under a short lock and
awaits the executor with no guard alive.

S7. Acceptance criterion: "`cargo test`, `cargo clippy -D warnings` and
`cargo fmt --check` pass" — domain/limits, policy matrix, fixtures, project
scoping, execution filtering and the process adapter (success, failure,
timeout).

## Design decisions

D1. **Approval policy is a pure matrix.** `approval_policy::evaluate(mode, kind)`
returns `Allow | RequireApproval`. Read-only tools (`search`, `list_files`,
`diff`) are the "safe/scoped" set; opaque tools (`command`, `subagent`) are not.
`ask_always` requires approval for everything, `full_access` allows everything
within the still-enforced path policy. No request field can claim an approval.

D2. **Provider data and project decisions are separate.** A hook source reports
`HookReport { definition, reported_status }`; a project decision overrides that
baseline. This is what lets the fixture report `notify-tool-use` as `approved`
while `proj-api-client` overrides `lint-on-write` to `rejected`.

D3. **No shell, ever.** Hook commands are tokenized into program + argument
array (whitespace, single/double quotes; backslashes stay literal so Windows
paths survive) and spawned directly. A rejected or pending hook is never
executed; only `approved` + `PreToolUse` hooks run, sequentially, with the
project's first authorized workspace root as `cwd`.

D4. **Executor safety.** The process adapter clears the environment, re-adds
only `PATH` (and `SystemRoot` on Windows), discards stdin/stdout/stderr,
enforces the hook timeout, kills on timeout, and never invokes `sh -c`.

D5. **No approval IPC command.** The frozen contract has no tool-approval
request/response shape, so the policy is a core use case
(`service::authorize_tool`) that `#21` and provider adapters `#25–#27` call
before executing anything; this ticket does not invent a wire command.

## Open questions (documented, not guessed)

1. **Declined-hook semantics.** A project-scoped `rejected` decision means the
   hook is not re-prompted and not executed. Whether the tool call the hook
   guards must also be blocked is **not specified**. The core records the
   decision and does not infer blocking; ask the product owner before
   implementing it. Recorded in `business-logic.md` §4.
2. **Auto-approve classification.** "Safe/scoped tools" is not enumerated by
   the product. This ticket adopts the conservative read-only set above and
   records the assumption here and in `approval_policy.rs`; no UI flag can
   override it.

## Tasks

T1. `projects/service.rs` + `projects/dto.rs` — project snapshot, hook-decision
upsert and one shared approval-status projection (S3, S5).
T2. `hooks/domain.rs` — `HookId`, `HookDefinition`, `HookReport`,
`ReviewedHook`, limits, `HookCommand` tokenizer and `HookError` (S3, S5, D3).
T3. `hooks/approval_policy.rs` — the three-mode × five-kind matrix and the
read-only classification (S2, D1).
T4. `hooks/ports.rs` + `hooks/adapters/{fake,process}.rs` — hook source,
executor port, fixture source and the shell-free process adapter (S1, S3, D3,
D4).
T5. `hooks/service.rs` — list/decide/authorize and approved-only `PreToolUse`
execution with an authorized `cwd` (S1–S4, S6).
T6. `hooks/commands.rs` + `lib.rs` — `list_hooks`, `set_hook_decision`, DTO/error
mapping and `generate_handler!` registration (S3, S5, S6).
T7. Tests + docs — fixture parity, policy matrix, project scoping, execution
filtering, process adapter tests, business-logic open question, then the three
deterministic judges (S4, S7).

## Delivery, routing and risk

- **Delivery strategy:** single feature branch, one backend ticket.
- **Not in this issue:** an interactive tool-approval command or UI (no frozen
  contract shape), real provider hook discovery (#25–#27 replace the fake
  source), blocking semantics for declined hooks, and any frontend wiring.
- **Risk:** (a) the read-only classification is a product assumption — kept
  conservative and documented; (b) process execution is the highest-risk
  boundary — mitigated by direct argv spawning, cleared environment, null stdio,
  timeout/kill and authorized `cwd`; (c) the fixture's `approved` baseline could
  be mistaken for a project decision — mitigated by `HookReport` vs
  `ReviewedHook` and the api-client override test.

## Log

L1. User request verbatim: "continua con la sigueinte issue y basandote en main".

L2. Branch `feat/issue-20-approval-policy-hooks` cut from `main` at `f978324`,
which already contains the #19 merge and therefore the run supervisor the
approval policy will guard.
