# Issue 16 — Cross-language IPC contract (shared kernel + feature catalogs)

## Objective and authority

Implement [issue #16](https://github.com/JoseCortezz25/nx-desktop/issues/16) — the full React↔Rust IPC boundary: intent-driven `snake_case` commands, camelCase DTOs, the closed `AppErrorDto` error contract, the `Channel` stream shapes, the typed TS clients under each feature's `api/`, one documented source in `docs/ipc/`, and cross-language contract tests — against base `6af748fd2f9eaa3333aa126a9105af5153bfe8e5` (`main`, issue #15 merged).

Child branch `feat/issue-16-ipc-kernel` and tracker branch `feat/issue-16-ipc-kernel-tracker` in isolated worktree `~/.fabrica/workspaces/nx-desktop/issue-16-kernel`.

**Orchestrator decision (delegated 4-PR plan).** Issue #16 ships as **four chained PRs** following the Explorer's recommended split (https://github.com/JoseCortezz25/nx-desktop/issues/16#issuecomment-6253400511), not one ~2,300-line PR:

1. **Slice 1 — shared kernel** (this delivery): the closed error DTO/code, the typed `invoke` wrapper with `unknown` rejection normalization, the `Channel` factory, the Rust serde counterpart, focused contract tests on both sides, and the slice-1 portion of the doc.
2. **Slice 2 — providers / projects / conversations** contracts and clients.
3. **Slice 3 — runs / subagents** contracts (incl. `RunStreamEventDto`) and clients.
4. **Slice 4 — workspace / files / diff / hooks** contracts and clients.

Slice 1 is the only slice in scope here. Slices 2–4 are listed for the shared document's completeness and stay **pending**; this delivery must not build them.

**Chain strategy — Feature Branch Chain (corrected in round 1 continuation).** The first delivery attempt was planned `stacked-to-main`, which would have made the slice-1 PR target `main` directly; merging it would have closed issue #16 at the first of four slices. Correcting to a Feature Branch Chain as `.agents/skills/chained-pr/SKILL.md` describes:

- `feat/issue-16-ipc-kernel-tracker` is the **tracker / final-integration branch**, cut from `main` at `6af748f` with an empty tracker commit (`3e3e907`). Its PR targets `main`, is **draft / no-merge**, and carries `Closes #16`; it is the only PR in the chain that may close the issue, and only once all four slices are integrated.
- `feat/issue-16-ipc-kernel` is **child PR 1 (slice 1)**, reviewed against the tracker branch. Slices 2–4 are later children that target their immediate predecessor branch.
- Because child PR 1's base is a **non-default** branch, GitHub does not auto-close #16 when it merges; the repository judge's required `Closes #16` is therefore kept on the child PR without prematurely closing the issue.
- The tracker and the children are separate branches sharing one `main` fork point, so GitHub's three-dot diff shows only the child's own commit (978 added lines across 15 files, no tracker scaffolding).

## Scope and constraints

**In (this delivery):**

- `src/shared/ipc/contracts.ts` — `AppErrorCode` (exactly the five `snake_case` codes already translated in `src/shared/i18n/messages.ts`), `AppErrorDto`, `isAppErrorDto`, `toAppErrorDto`.
- `src/shared/ipc/client.ts` — `ipcInvoke<TResponse>`, the `Channel` factory, `unknown` rejection normalization. No React imports (`critical-constraints.md` §3).
- `src/shared/ipc/*.test.ts` — focused contract tests.
- `src-tauri/src/ipc/{mod.rs,error.rs}` — Rust `AppErrorDto`, `AppErrorCode`, the minimal error-mapping seam.
- `src-tauri/src/lib.rs` — only `pub mod ipc;`.
- `src-tauri/tests/ipc_contract.rs` — serde round-trip against the same fixtures.
- `docs/ipc/README.md`, `docs/ipc/fixtures/*.json` — the slice-1 contract documentation and machine-checkable fixtures shared by both suites.

**Out (explicitly excluded):**

- Feature DTOs/clients (`src/features/*/api/*`) — slices 2–4.
- `cargo`/`package` dependency edits (no `ts-rs`/`specta`; fixture parity is the dependency-free route).
- Command registration (`generate_handler!`), `build.rs` ACL, `permissions/`, capabilities.
- Hooks/UI wiring, mock replacement, backend services/adapters/`RunSupervisor`.
- `src/shared/domain/**`, `messages.ts`.

**Constraints:** 100% English identifiers; named TS exports, zero `any`, `import type`; Rust `-D warnings` clean and no `.unwrap()`/`.expect()` on fallible paths; DTO field casing `camelCase` on the wire, `snake_case` Rust fields, `snake_case` error codes; no AI attribution; Conventional Commits; no edits to `main`.

## Stable slice IDs

| ID        | Slice                                        | Status    |
| --------- | -------------------------------------------- | --------- |
| `SLICE-1` | Shared kernel (error + invoke/channel)       | delivered |
| `SLICE-2` | Providers / projects / conversations catalog | delivered |
| `SLICE-3` | Runs / subagents (stream union)              | delivered |
| `SLICE-4` | Workspace / files / diff / hooks             | delivered |

## Acceptance criteria and checks per slice

### SLICE-1 (this delivery)

- **A1** `AppErrorCode` is exactly the five `snake_case` codes `validation_failed`, `permission_denied`, `provider_unavailable`, `cancelled`, `internal_error` — matching the `messages.ts` keys — on both sides.
- **A2** Rust `AppErrorCode` serializes to and deserializes from those exact five strings (`rename_all = "snake_case"`).
- **A3** `AppErrorDto` crosses the wire as `{ code, message, retryable, requestId }` (`camelCase`); Rust fields stay `snake_case`.
- **A4** TS and Rust tests consume the **same** `docs/ipc/fixtures/*.json` and agree byte-for-byte.
- **A5** `toAppErrorDto` passes a valid DTO through and normalizes an `Error`/string/unknown into `internal_error`/`retryable=false`.
- **A6** `ipcInvoke` resolves the typed payload on success and rejects with an `AppErrorDto` (never a raw `Error`).
- **A7** The `Channel` factory returns a `Channel` whose `onmessage` forwards each message to the handler unchanged.
- **A8** `docs/ipc/README.md` documents the five codes, the DTO field table, exact wire examples and Channel registration ordering for this slice.
- **A9** `pnpm install --frozen-lockfile`, `pnpm run typecheck`, `pnpm run lint`, `pnpm test`, `pnpm run format:check`, `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`, `git diff --check`, PR judge all pass.

### SLICE-2 (implemented in round 2)

Providers (`list_providers`, `list_models`), projects (`list_projects`, `create_project`, `set_project_approval_mode`, `list_workspace_branches`), conversations (`list_conversations`, `create_conversation`) contracts + clients.

- **S2-A1** The eight commands are typed in `src/features/{providers,projects,conversations}/api/*-client.ts` with the intent-driven `snake_case` names and the `{ request }` envelope for every parameterized call.
- **S2-A2** TS DTOs (`*Dto`) are `camelCase` and reuse the domain unions (`ApprovalMode`, `HookApprovalStatus`, `MessageRole`, `ToolCallKind`, `ToolCallStatus`, `EffortLevel`) instead of redefining them.
- **S2-A3** Rust DTOs in `src-tauri/src/features/{providers,projects,conversations}/dto.rs` serialize/deserialize the **same** JSON, with `camelCase` on the wire, `snake_case` Rust fields, `snake_case` closed enums and `deny_unknown_fields` on every request.
- **S2-A4** Shared command-envelope fixtures in `docs/ipc/fixtures/` are read by both suites and round-trip byte-for-byte; a DTO field or enum drift fails on one side.
- **S2-A5** `CreatedProjectDto` and `ProjectDto[]` keep the port shapes (`create_project` → `{ project, projects }`; `set_project_approval_mode` → `ProjectDto[]`).
- **S2-A6** Authority-bearing requests (`set_project_approval_mode`, `list_workspace_branches`, `create_conversation`) carry `projectId`; the Rust test pins it. The `provider → model → effort` invariant is documented and its enforcement is explicitly deferred to #17.
- **S2-A7** `docs/ipc/README.md` catalogs the eight commands, the DTO field tables, the authority/invariant notes, exact request examples and the fixture index.
- **S2-A8** All slice-2 checks (install, typecheck, lint, focused and full tests, format:check, rust fmt/clippy/test, `git diff --check`) pass; the exact outputs are in the slice-2 delivery section.

### SLICE-3 (implemented in round 3)

Runs (`start_run`, `cancel_run`, `get_run`) and the closed six-kind `RunStreamEventDto` union; subagents (`list_subagents`, `cancel_subagent`).

- **S3-A1** `start_run` passes `{ request, onEvent: Channel<RunStreamEventDto> }`, and the caller binds `onEvent` before the command is invoked (`src/features/runs/api/run-client.ts`, README §2/§6).
- **S3-A2** `cancel_run`/`get_run` send `{ runId }`; `list_subagents` sends `{ runId }`; `cancel_subagent` sends `{ runId, subagentId }`.
- **S3-A3** `RunStreamEventDto` is a discriminated union of exactly `started`, `textDelta`, `toolActivity`, `completed`, `failed`, `cancelled`, with `runId` + monotonic `seq` on every frame; the TS test proves exhaustive handling with `assertNever`.
- **S3-A4** Rust models the union as an internally tagged enum (`tag = "kind"`, camelCase variants and fields) and pins byte-for-byte round-trip, an unknown-kind rejection and the six wire values.
- **S3-A5** `StartRunRequestDto` carries `conversationId`, `projectId`, `providerId`, `modelId`, `effortLevel`, `prompt`, `environment` and **no `approvalMode`**; the Rust negative test rejects an injected `approvalMode`.
- **S3-A6** `RunStatus` is `pending | streaming | completed | failed | cancelled`; `started` is a frame kind, not a status.
- **S3-A7** Rust DTOs use `#[serde(rename_all = "camelCase")]`, `snake_case` Rust fields, `deny_unknown_fields` on every request and closed `snake_case` enums; six shared fixtures are read by both suites.
- **S3-A8** All slice-3 checks (install, typecheck, lint, focused and full tests, format:check, rust fmt/clippy/test, `git diff --check`) pass; exact outputs in the slice-3 delivery section below.

### SLICE-4 (implemented in round 4)

Workspace (`read_file`, `read_workspace_diff`, `list_open_targets`, `open_in_target`) and hooks (`list_hooks`, `set_hook_decision`) contracts + clients, each carrying the relevant `projectId`/`runId` authority context. Checks: fixtures per command; authority fields present.

- **S4-A1** The six commands are typed with the exact intent-driven `snake_case` names and the `{ request }` envelope for every parameterized call: `read_file` (`{ projectId, path }`), `read_workspace_diff` (`{ projectId }`), `open_in_target` (`{ projectId, target, path }`), `list_hooks` (`{ projectId }`), `set_hook_decision` (`{ projectId, hookId, approvalStatus }`); `list_open_targets` is parameterless because its report is machine-scoped.
- **S4-A2** Feature ownership follows the existing repository boundaries: `read_file` in `src/features/projects/api/workspace-*` (workspace read), open targets in `src/features/files/api/open-target-*`, the diff in `src/features/diff/api/diff-*`, hooks in `src/features/hooks/api/hook-*`. Command names stay exact regardless of module.
- **S4-A3** Request/result DTOs come from the real UI-facing types: `FileDocumentDto | null` (the port resolves `null` for no document), `DiffFileDto[]` with the closed `context | added | removed` line kinds, `OpenTargetAvailabilityDto[]`, `HookDto[]`, and the updated `HookDto` for a decision. `open_in_target` resolves `null`, matching the port's `void`.
- **S4-A4** Authority anchors are explicit, not spoofed: `projectId` on every workspace/hook request that resolves roots or decisions; `path` stays workspace-relative on `read_file` and `open_in_target`. `list_open_targets` intentionally has no `projectId` (machine-scoped). Hooks requests deliberately carry **no** `runId`: the decision is project-scoped and survives the run. The DTOs are not enforcement; #20/#21/#24 validate Shape / Limits / Invariants / Authority.
- **S4-A5** Hooks follow the actual policy: the closed `HookApprovalStatus` (`pending | approved | rejected`) is shared with `ProjectDto.hookDecisions`, and no seventh `RunStreamEventDto` kind (`hookReviewRequired`) is invented.
- **S4-A6** Rust serde skeletons in `src-tauri/src/features/{workspace,files,diff,hooks}/dto.rs` use `camelCase` on the wire, `snake_case` fields, closed `snake_case` enums and `deny_unknown_fields` on every request; `HookApprovalStatusDto` is reused from the project catalog so the two hook statuses cannot drift.
- **S4-A7** Six shared fixtures (`workspace-read-file`, `diff-read-workspace-diff`, `files-list-open-targets`, `files-open-in-target`, `hooks-list-hooks`, `hooks-set-hook-decision`) are read by the TS and Rust suites; the Rust negative tests pin unknown fields, unknown enum values, the nullable read and the void open response.
- **S4-A8** `docs/ipc/README.md` catalogs the six commands, the DTO tables, the authority/deferred-enforcement notes, the exact wire examples and the fixture index; the slice table and delivery narrative cover slice 4.
- **S4-A9** All slice-4 checks (install, typecheck, lint, focused and full tests, format:check, rust fmt/clippy/test, `git diff --check`, live PR judge) pass; exact outputs in the slice-4 delivery section below.

## Delivery, routing and risk

- **Delivery strategy:** `auto-chain`.
- **Chain strategy:** `feature-branch-chain` (see the tracker/child boundaries above). Tracker PR → `main` (draft, no-merge, `Closes #16`); slice-1 child PR → tracker branch (keeps `Closes #16`, no auto-close); slices 2–4 → immediate predecessor. Not `stacked-to-main`; the earlier plan is superseded.
- **Route / trigger:** multi-file cross-language change → delegated writer (Builder) in this isolated worktree, then independent Verifier, then functional-only QA. Slice 1 produces no UI surface, so its QA handoff is **functional-only**: no browser route, no visual baseline; QA re-runs the focused automated invocations.
- **Forecast:** ~2,300 authored lines across the four slices (Explorer forecast 2,200–2,400, advisory). Slice 1 forecast ~450. Advisory only; the kernel is not to be code-golfed under the budget at the cost of its tests or docs.
- **Review budget / `size:exception` recommendation:** slice 1 is **978 changed lines (978 additions, 0 deletions) across 15 files**, above the advisory 400; the maintainer authorized a `size:exception` for **PR #63 only** (issue #16 comment `6254393097`), and it does not transfer to slice 2. One honest slicing pass on slice 1 found no cohesive sub-slice: the closed error contract, its five cross-language fixtures, the TS and Rust contract suites and the slice-1 doc are one inseparable unit — a fixture-only or test-only slice would neither compile nor gate on its own, and `src/shared/ipc/client.ts` (46 lines) has no independent behavior without `contracts.ts`. The earlier 949 figure was `33bcd2d`; the frozen chain-accounting commit made it 978. Slices 2–4 each carry the same recommendation at their own boundary.

- **Slice-2 review budget / `size:exception`:** the first slice-2 round measured **1615 changed lines (1577 additions, 38 deletions, 31 files)** and returned `blocked` because PR #63's exception explicitly did not transfer. The maintainer then accepted the cohesive slice-2 overage and directed the factory to stop re-asking the same review-size question for the remaining issue #16 slices: [issue #16 comment `6254871354`](https://github.com/JoseCortezz25/nx-desktop/issues/16#issuecomment-6254871354). That authorization is a delivery-size decision only — it is not a Verifier/QA pass and not merge authorization. The unblocked continuation is recorded in the slice-2 continuation section below.
- **Risk:** the error codes / DTO fields are public contract — renaming later cascades through #17–#27; slice 1 pins them exactly to `messages.ts` and the fixtures. Remote CI on this account has historically shown `startup_failure`; the real local checks are the evidence of record. Engram **is** available in this runtime, so the mirror below is a real save, not faked.
- **Corrected cosmetic deviation (round 2):** the earlier note claimed `docs/ipc/README.md` still said the slices ship "stacked-to-main". That is no longer true: commit `67bb1b9` corrected the README to the Feature Branch Chain wording, and `docs/ipc/README.md` now has zero occurrences of "stacked-to-main". The stale note is corrected here rather than left standing.
- **Runtime gotcha:** `@types/node` is not part of the `src` TypeScript program, so `node:fs`/`node:url` do not typecheck inside `src/**`. `tsconfig.json` is outside this slice's edit surface, so the shared fixtures are consumed from TS through `resolveJsonModule` imports instead.

## Tasks and progress

- [x] **T1 — ODD task file** (`SLICE-1` planning) before the first source write.
- [x] **T2 — Fixtures + Rust + TS contract tests (RED first)** then the shared kernel implementation (`SLICE-1`). Checks A1–A9.
- [x] **T3 — Slice-1 documentation** (`docs/ipc/README.md`).

T1–T3 are delivered by the frozen slice-1 implementation commit `33bcd2dc9674be7008ccb6aa57731b6044499c8a` on `feat/issue-16-ipc-kernel`, which is **preserved byte-for-byte** (not amended, rebased or squashed). The chain-strategy correction is recorded in a second, docs-only commit on the same branch. Both identities and the tracker branch are recorded in the issue #16 `Coder Agent says:` receipt and the PR bodies.

- [x] **T7 — Chain accounting** (`SLICE-1`): record the `feature-branch-chain` boundaries, the tracker branch and the actual checks in this document without rewriting T1–T3.
- [x] **T4 — SLICE-2** providers/projects/conversations: TS contracts + clients, Rust DTOs, shared command-envelope fixtures, cross-language contract tests and the `docs/ipc/README.md` catalog. Delivered by `83e3cee` plus the docs-only continuation commit on `feat/issue-16-ipc-catalog`; see the slice-2 delivery section below for the exact count and checks.
- [x] **T5 — SLICE-3** runs/subagents: TS contracts + clients, Rust DTO skeletons, six shared fixtures, cross-language contract tests and the `docs/ipc/README.md` catalog. Delivered by the slice-3 work-unit commit on `feat/issue-16-ipc-runs`; see the slice-3 delivery section below.
- [x] **T6 — SLICE-4** workspace/files/diff/hooks: TS contracts + clients, Rust DTO skeletons, six shared fixtures, cross-language contract tests and the `docs/ipc/README.md` catalog. Delivered by the slice-4 work-unit commit on `feat/issue-16-ipc-workspace`; see the slice-4 delivery section below.

## Chain boundaries (actual)

| Role                 | Branch                             | Commit                              | Base                          | Diff vs base                         |
| -------------------- | ---------------------------------- | ----------------------------------- | ----------------------------- | ------------------------------------ |
| Tracker / final      | `feat/issue-16-ipc-kernel-tracker` | `3e3e907`                           | `main` @ `6af748f`            | empty tracker commit (0 files)       |
| Child PR 1 (slice 1) | `feat/issue-16-ipc-kernel`         | `33bcd2d` + chain-accounting commit | tracker branch                | 15 files, 978 additions, 0 deletions |
| Child PR 2 (slice 2) | `feat/issue-16-ipc-catalog`        | `83e3cee` + continuation commit     | child PR 1 branch             | 31 files, 1577 +, 38 −               |
| Child PR 3 (slice 3) | `feat/issue-16-ipc-runs`           | work-unit commit                    | child PR 2 branch @ `8e64eef` | 20 files, 1451 +, 25 -               |
| Child PR 4 (slice 4) | `feat/issue-16-ipc-workspace`      | work-unit commit                    | child PR 3 branch @ `f69ed76` | 30 files, 1496 +, 33 −               |

## Engram mirror

Engram is reachable in this runtime (contrary to the earlier handoff's assumption), so the mirror is a real save, not a placeholder. The slice-1 kernel decision lives in project `nx-desktop` under `topic_key: architecture/ipc-error-contract` (observation `1538`, state `active`); the round-1 continuation upserted that same topic with the Feature Branch Chain correction rather than creating a competing key. The three surfaced candidate relations were judged `related`, `not_conflict` and `related` (no conflict). This file remains the authoritative, reviewable local record.

## Actual evidence (builder self-check — not QA)

The RED observations below were recorded in the first (interrupted) run against this same frozen code state. They were **not** re-run in the round-1 continuation because reproducing them would require deleting or renaming tracked files; they are labelled as carried-over observations, not as fresh proof.

RED first, on the focused contract tests, before the implementation existed (carried over from the first run):

| RED observation                                                                 | Result                                                                 |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm vitest run src/shared/ipc`                                                | 2 test files failed: `Cannot find module './contracts'` / `'./client'` |
| `cargo test --test ipc_contract` (with the `pub mod ipc;` declaration reverted) | `error[E0433]: cannot find ipc in nx_desktop_lib`                      |

GREEN, re-run from scratch on `feat/issue-16-ipc-kernel` in the round-1 continuation after the chain-accounting commit:

| Check                                                                            | Result                                              |
| -------------------------------------------------------------------------------- | --------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                 | lockfile up to date; no resolution change           |
| `pnpm run typecheck`                                                             | clean (0 errors)                                    |
| `pnpm run lint`                                                                  | clean (0 problems)                                  |
| `pnpm test`                                                                      | 65 files / 412 tests passed                         |
| `pnpm run format:check`                                                          | all matched files use Prettier code style           |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`                | clean                                               |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | finished with no warnings                           |
| `cargo test --manifest-path src-tauri/Cargo.toml`                                | all targets green; `tests/ipc_contract.rs` 4 passed |
| `git diff --check`                                                               | clean (no whitespace/conflict errors)               |
| `node scripts/verify-pr-conventions.mjs --pr` (PR title + body)                  | judge OK for the child PR payload                   |

## Slice-2 delivery (round 2, Builder round 1)

**Branch / base.** `feat/issue-16-ipc-catalog`, cut from the approved slice-1 child
HEAD `67bb1b99151eed47c83439a92b101d64bdbc6d0e` (not `main`). Target base for the
child PR is `feat/issue-16-ipc-kernel` (the immediate predecessor branch).

**What landed (contract only).**

- TS contracts + clients: `src/features/providers/api/{provider.contracts,provider-client}.ts`,
  `src/features/projects/api/{project.contracts,workspace.contracts,project-client,workspace-client}.ts`,
  `src/features/conversations/api/{conversation.contracts,conversation-client}.ts`.
- TS tests: `provider.test.ts`, `project.test.ts`, `workspace.test.ts`, `conversation.test.ts`.
- Rust DTOs: `src-tauri/src/features/{providers,projects,conversations}/dto.rs` plus the
  `mod.rs` wiring and `pub mod features;` in `src-tauri/src/lib.rs`. No service,
  command, port, adapter, supervisor or `generate_handler!` entry (all #17–#21).
- Shared fixtures: eight command-envelope JSON files in `docs/ipc/fixtures/`.
- Rust contract tests: six new tests in `src-tauri/tests/ipc_contract.rs` (round-trip
  responses, round-trip requests, optional-title absence, unknown-field rejection,
  enum wire values, authority-bearing `projectId`).
- Docs: `docs/ipc/README.md` command catalog (8 rows), DTO field tables,
  authority/invariant notes and exact request examples. ODD S2 acceptance + this
  section; the stale "stacked-to-main" note and the 949-line figure are corrected.

**RED → GREEN.** The focused runners used here are `vitest` and `cargo test`. The
RED observations from slice 1 are carried over in this document (the same
runners: missing modules fail `vitest`, missing types fail `cargo test`); this
round did not re-delete tracked files to reproduce them. GREEN, measured on the
slice-2 commit:

| Check                                                                            | Result                                               |
| -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                 | lockfile up to date; no resolution change            |
| `pnpm run typecheck`                                                             | clean (0 errors)                                     |
| `pnpm run lint`                                                                  | clean (0 problems)                                   |
| `pnpm vitest run src/features/{providers,projects,conversations}/api`            | 8 files / 42 tests passed                            |
| `pnpm test`                                                                      | 69 files / 429 tests passed                          |
| `pnpm run format:check`                                                          | all matched files use Prettier code style            |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`                | clean                                                |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | finished with no warnings                            |
| `cargo test --manifest-path src-tauri/Cargo.toml`                                | all targets green; `tests/ipc_contract.rs` 10 passed |
| `git diff --cached --check`                                                      | clean (no whitespace/conflict errors)                |

**Review-size gate (blocking in this round; unblocked in the continuation round
below — kept as history).** Slice 2 is **31 files, 1577 additions, 38
deletions = 1615 changed lines** against `67bb1b9` (measured with `git diff
--numstat 67bb1b9..HEAD`). This is over the advisory 400
and PR #63's `size:exception` explicitly does not transfer. One honest cohesive
slicing attempt was made; its counts are:

| Cohesive sub-slice (all 8 commands kept)  | Approx. changed lines | Fits 400? |
| ----------------------------------------- | --------------------- | --------- |
| providers (2 commands)                    | ~314                  | yes       |
| projects (4 commands)                     | ~555                  | no        |
| conversations (2 commands)                | ~447                  | no        |
| shared Rust test helper / features wiring | ~100                  | n/a       |

No cohesive sub-slice that preserves the accepted slice-2 deliverable (all eight
commands, their shared fixtures, cross-language tests and docs) fits 400: the
per-feature split still leaves projects and conversations over budget, and a
finer split (project-catalog vs workspace-branches, conversation-list vs
conversation-create) would rewrite the approved four-slice chain — an
orchestrator/maintainer decision, not the Builder's. Per the review-size gate the
Builder **stops before opening an oversized PR** and returns `blocked` with these
exact counts, preserving the implementation on the local slice-2 commit. Two
maintainer options: (a) an explicit `size:exception` for this slice-2 PR, or (b)
authorize a re-slice of slice 2 into ≤400 sub-slices (providers, project catalog,
workspace branches, conversations) and continue the chain.

**State (this round).** No PR was opened and the branch was not pushed, so
nothing oversized or premature entered review. Labels were left as the
orchestrator set them (`ready-for-agent` on #16); no issue transition is implied
by a blocked receipt. **Superseded by the continuation round below:** the
maintainer accepted the `size:exception`, the branch was pushed and child PR 2
was opened.

## Slice-2 delivery — Builder continuation (`size:exception` accepted)

**Authorization.** The maintainer accepted the cohesive slice-2 overage of
**1615 changed lines (1577 additions, 38 deletions, 31 files)** and directed the
factory not to pause again on the review-size threshold for the remaining issue
#16 slices: [issue #16 comment `6254871354`](https://github.com/JoseCortezz25/nx-desktop/issues/16#issuecomment-6254871354).
The blocked round is preserved at [issue #16 comment `6254707877`](https://github.com/JoseCortezz25/nx-desktop/issues/16#issuecomment-6254707877).
The authorization is a delivery-size decision only: it is not a Verifier/QA pass,
not a merge, and it does not permit weakening tests or docs, skipping
Verifier/QA, or closing issue #16.

**Preservation.** The slice-2 implementation commit
`83e3ceede92c62bb6267b900a214a7486af59d0c` is preserved byte-for-byte — not
amended, rebased, squashed, re-sliced or refactored. The only repository change
in this round is this document (one docs-only commit recording the accepted
exception and the new PR evidence). No source, test, fixture, README or config
file was touched.

**Child PR (2 of 4).**

| Field        | Value                                                                               |
| ------------ | ----------------------------------------------------------------------------------- |
| Branch       | `feat/issue-16-ipc-catalog`                                                         |
| Target base  | `feat/issue-16-ipc-kernel` (child PR 1 / PR #63 head) — not `main`, not the tracker |
| Position     | 2 of 4 in the issue-16 Feature Branch Chain                                         |
| Diff vs base | 31 files, 1577 additions, 38 deletions = 1615 changed lines                         |
| Review size  | 1615 / 400 — cohesive overage, **accepted `size:exception`** (rationale above)      |
| Tracker      | PR #62 stays draft / no-merge; issue #16 stays open until the chain integrates      |

**Checks at this round's HEAD.** Only this Markdown document changed in the
round, so the slice-2 source checks in the round-2 table still describe the same
unchanged source files; they are attributed to the HEAD that measured them
(`83e3cee`). Run at the continuation HEAD:

| Check                                           | Result                                    |
| ----------------------------------------------- | ----------------------------------------- |
| `pnpm run format:check`                         | all matched files use Prettier code style |
| `git diff --check` (base..HEAD)                 | clean (no whitespace/conflict errors)     |
| `pnpm run check:pr` (live PR branch/title/body) | JUDGE OK                                  |

## Slice-3 delivery (round 3, Builder round 1)

**Branch / base.** `feat/issue-16-ipc-runs`, cut from the approved slice-2 child
HEAD `8e64eefc961f17baa5e9e2a8145d2f26aaed3b98` (PR #64 head), not `main`. The
child PR targets `feat/issue-16-ipc-catalog` (the immediate predecessor branch,
PR #64's branch), never `main` or the tracker.

**What landed (contract only).**

- TS contracts + clients: `src/features/runs/api/{run.contracts,run-client}.ts`,
  `src/features/subagents/api/{subagent.contracts,subagent-client}.ts`.
- TS tests: `src/features/runs/api/run.test.ts`,
  `src/features/subagents/api/subagent.test.ts`.
- Rust DTO skeletons: `src-tauri/src/features/runs/{mod,dto}.rs`,
  `src-tauri/src/features/subagents/{mod,dto}.rs`, wired in
  `src-tauri/src/features/mod.rs`. No service, command, port, adapter,
  supervisor or `generate_handler!` entry (all #19–#23).
- Shared fixtures: six JSON files in `docs/ipc/fixtures/` (`runs-*`,
  `subagents-*`, including one canonical frame per stream kind).
- Rust contract tests: ten new tests in `src-tauri/tests/ipc_contract.rs`.
- Docs: `docs/ipc/README.md` command catalog (5 new rows), `RunDto` /
  `SubagentDto` / `RunStreamEventDto` tables, the `hookReviewRequired` amendment
  question, the open subagent owner and exact wire examples.

**Contract decisions.**

- The stream union follows the normative six kinds; `hookReviewRequired` is
  documented as a #20 amendment question, not invented as a seventh variant.
- `StartRunRequest` carries no `approvalMode`; `projectId` is authority-bearing
  and #19 enforces `conversation.projectId == projectId`.
- `get_run` is the authoritative snapshot-on-reopen read; the richer snapshot
  payload (accumulated text/tool activity) is left to #19.
- `list_subagents`/`cancel_subagent` are defined as intent-driven commands, but
  their implementation owner stays open between #19 and #23; no lifecycle
  behavior is invented.
- `toolActivity.toolCall` and `SubagentDto.transcript` reuse the conversation
  wire shapes (`ToolCallDto`, `ConversationMessageDto`) instead of duplicating
  them, so one product entity has one wire shape; the research doc sanctions
  exposing a cross-module API from the module.

**RED → GREEN.** A focused deterministic RED was observed for the Rust suite by
temporarily removing the `pub mod runs;` / `pub mod subagents;` declarations:
`cargo test --test ipc_contract` failed with
`error[E0433]: cannot find runs in features` and `cannot find subagents in
features`. The declarations were restored and the suite passed. The TS focused
suite was authored and run in the same pass, so no destructive RED reproduction
was performed there (the same honesty as the carried-over slice-1/2 notes).

| Check                                                                            | Result                                               |
| -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                 | lockfile up to date; no resolution change            |
| `pnpm vitest run src/features/runs/api src/features/subagents/api`               | 3 files / 20 tests passed                            |
| `pnpm test`                                                                      | 71 files / 442 tests passed                          |
| `pnpm run typecheck`                                                             | clean (0 errors)                                     |
| `pnpm run lint`                                                                  | clean (0 problems)                                   |
| `pnpm run format:check`                                                          | all matched files use Prettier code style            |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`                | clean                                                |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | finished with no warnings                            |
| `cargo test --manifest-path src-tauri/Cargo.toml`                                | all targets green; `tests/ipc_contract.rs` 20 passed |
| `git diff --check`                                                               | clean (no whitespace/conflict errors)                |

**Review size.** The slice-3 work unit measures **20 files, 1451 additions, 25
deletions = 1476 changed lines** against `8e64eef`. It is one cohesive unit: the
six fixtures, both language contracts, the two contract suites and the catalog
docs do not compile or gate independently (a fixture-only or test-only slice
would not typecheck), and a runs/subagents split would still leave the run stream
plus its tests and docs over budget. The maintainer's standing authorization for
cohesive issue #16 overages applies (issue #16 comment `6254871354`): it is a
delivery-size decision only — not a Verifier/QA pass and not merge
authorization.

**State.** Child PR 3 opened against `feat/issue-16-ipc-catalog`; issue #16 and
the PR are set to `ready-for-review` for the Verifier. No self-approval, no
merge, no remote-CI claim.

## Slice-4 delivery (round 4, Builder round 1)

**Branch / base.** `feat/issue-16-ipc-workspace`, cut from the approved slice-3
child HEAD `f69ed7686e4e3220fac1c22305b53b4a5e8839f1` (PR #65 head), not `main`.
The child PR targets `feat/issue-16-ipc-runs` (the immediate predecessor branch,
PR #65's branch), never `main` or the tracker.

**Historical note.** The slice-1 planning paragraph near the top of this file
("Slice 1 is the only slice in scope here … slices 2–4 … stay pending") is the
round-1 record and is preserved byte-for-byte. Slices 2, 3 and 4 are delivered in
the sections below; the current status is also in the stable-slice-ID table.

**What landed (contract only).**

- TS contracts + clients: `src/features/projects/api/{workspace.contracts,workspace-client}.ts`
  (`read_file`, appended to the slice-2 branch contract), `src/features/diff/api/{diff.contracts,diff-client}.ts`,
  `src/features/files/api/{open-target.contracts,open-target-client}.ts` and
  `src/features/hooks/api/{hook.contracts,hook-client}.ts`.
- TS tests: `workspace.test.ts` (slice-4 cases), `diff.test.ts`,
  `open-target.test.ts` and `hook.test.ts`.
- Rust DTO skeletons: `src-tauri/src/features/{workspace,files,diff,hooks}/{mod,dto}.rs`,
  wired in `src-tauri/src/features/mod.rs`. No service, command, port, adapter,
  supervisor or `generate_handler!` entry (all #20/#21/#24).
- Shared fixtures: six JSON files in `docs/ipc/fixtures/` (`workspace-read-file`,
  `diff-read-workspace-diff`, `files-list-open-targets`, `files-open-in-target`,
  `hooks-list-hooks`, `hooks-set-hook-decision`).
- Rust contract tests: nine new tests in `src-tauri/tests/ipc_contract.rs`.
- Docs: `docs/ipc/README.md` command catalog (6 new rows), the file/diff/open-target/hook
  DTO tables, the authority and deferred-enforcement notes, exact wire examples
  and the fixture index; this ODD file's S4 acceptance, T6 and chain accounting.

**Feature ownership and contract decisions.**

- Ownership follows the existing repository boundaries: `read_file` extends the
  workspace client in `projects/api`; the open targets live in `files/api`; the
  diff in `diff/api`; the hooks in `hooks/api`. Command names stay exact.
- `read_file` resolves `FileDocumentDto | null` (the port's missing-document
  case) and `open_in_target` resolves `null`, matching the port's `void`.
  `list_open_targets` is parameterless because the installed-target report is
  machine-scoped; giving it a `projectId` would be false ownership.
- Authority anchors are explicit: `projectId` on the file read, the diff read,
  the external open and both hook calls; `path` stays workspace-relative on the
  two path-bearing calls. Hooks requests deliberately carry **no** `runId`: the
  decision is project-scoped and survives the run. The DTOs are not enforcement;
  #20/#21/#24 validate Shape / Limits / Invariants / Authority.
- The hook status uses the closed `HookApprovalStatus` shared with
  `ProjectDto.hookDecisions`, so the two catalogs cannot drift; no seventh
  `RunStreamEventDto` kind is invented.
- The `OpenTarget` enum stays the closed five-value domain vocabulary while the
  locked `Abrir` decision offers only VS Code when installed; the restriction is
  a product rule enforced by the menu and the core, not by shrinking the wire
  enum (#12/#21).

**RED → GREEN.** A focused deterministic RED was observed for the Rust suite by
temporarily replacing `pub mod workspace;` with a commented declaration:
`cargo test --test ipc_contract` failed with
`error[E0433]: cannot find workspace in features`. The declaration was restored
byte-for-byte and the suite passed. The TS focused suite was authored and run in
the same pass, so no destructive RED reproduction was performed there (the same
honesty as the carried-over slice-1/2/3 notes).

| Check                                                                                                                                                                           | Result                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                | lockfile up to date; no resolution change            |
| `pnpm vitest run src/features/projects/api/workspace.test.ts src/features/diff/api/diff.test.ts src/features/files/api/open-target.test.ts src/features/hooks/api/hook.test.ts` | 4 files / 21 tests passed                            |
| `pnpm test`                                                                                                                                                                     | 74 files / 461 tests passed                          |
| `pnpm run typecheck`                                                                                                                                                            | clean (0 errors)                                     |
| `pnpm run lint`                                                                                                                                                                 | clean (0 problems)                                   |
| `pnpm run format:check`                                                                                                                                                         | all matched files use Prettier code style            |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`                                                                                                               | clean                                                |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`                                                                                                | finished with no warnings                            |
| `cargo test --manifest-path src-tauri/Cargo.toml`                                                                                                                               | all targets green; `tests/ipc_contract.rs` 29 passed |
| `git diff --cached --check`                                                                                                                                                     | clean (no whitespace/conflict errors)                |

**Review size.** The slice-4 work unit measures **30 files, 1496 additions, 33
deletions = 1529 changed lines** against `f69ed76` (`git show --shortstat
HEAD`). It is one cohesive contract unit: the six fixtures, both language
contracts, the four contract suites and the catalog docs do not compile or gate
independently (a fixture-only or test-only slice would not typecheck), and a
per-feature split would still leave the workspace/diff/hooks groups plus the
shared Rust test helper over budget. The maintainer's standing authorization for
cohesive issue #16 overages applies (issue #16 comment `6254871354`): it is a
delivery-size decision only — not a Verifier/QA pass and not merge authorization.

**State.** Child PR 4 opened against `feat/issue-16-ipc-runs`; issue #16 and the
PR are set to `ready-for-review` for the Verifier. No self-approval, no merge, no
remote-CI claim; PRs #63/#64/#65 stay `ready-for-human` and unmerged, tracker #62
stays draft.

## Log

- L1 (orchestrator handoff): implement `SLICE-1` only, four chained PRs, stacked-to-main, no PR/merge to `main`, no false pass.
- L2: Engram probe showed the tool store reachable, so the mirror was written and the "PENDING" assumption corrected.
- L3: `node:` builtins do not resolve in the `src` TS program; fixtures consume via `resolveJsonModule` without touching `tsconfig.json`.
- L4 (round-1 continuation, strategy correction): `stacked-to-main` was wrong for a four-slice chain because the first slice would have closed #16. Switched to `feature-branch-chain` with tracker `feat/issue-16-ipc-kernel-tracker`; the child PR keeps the judge-required `Closes #16` and stays safe because its base is a non-default branch. The frozen implementation commit `33bcd2d` was preserved and the correction was recorded in a separate docs-only commit.
- L5: every GREEN check in the table above was re-run from scratch in the round-1 continuation; the RED rows are carried-over observations and are labelled as such rather than claimed as fresh.
- L6 (slice 2, round 2): implemented `SLICE-2` contracts/clients/DTOs/fixtures/tests/docs on `feat/issue-16-ipc-catalog` from `67bb1b9`. Typed `satisfies`/typed-literal parity plus Rust `include_str!` round-trip keep both sides on the same fixture bytes.
- L7: `docs` is in `.prettierignore`, so slice-2 fixtures are not reformatted by `format:check`; they are still validated by both contract suites.
- L8 (review-size gate): slice 2 measures 1615 changed lines (1577 additions, 38 deletions, 31 files). One cohesive per-feature split still leaves projects (~555) and conversations (~447) above 400, so no cohesive ≤400 slice preserves the accepted deliverable; the Builder stopped before opening an oversized PR and returned `blocked` for a maintainer `size:exception` or a re-slice. Implementation preserved locally; no PR, no push, no label change.
- L9 (slice 2, Builder continuation): the maintainer accepted the cohesive 1615-line slice-2 overage and told the factory not to re-ask the review-size question for the remaining issue #16 slices (issue #16 comment `6254871354`). The branch was pushed and child PR 2 was opened against `feat/issue-16-ipc-kernel`; the implementation commit `83e3cee` was preserved byte-for-byte and only this ODD document changed in the round.
- L10 (slice 3, round 3): implemented `SLICE-3` on `feat/issue-16-ipc-runs` from `8e64eef`. The run stream is the closed six-kind union; `hookReviewRequired` stays out as a #20 amendment. `start_run` omits `approvalMode` and carries `projectId` as the authority anchor; the subagent intents are defined with an open #19/#23 owner and no invented lifecycle. The run stream and subagent DTOs reuse the conversation `ToolCallDto`/`ConversationMessageDto` so one product entity has one wire shape.
- L11 (slice 4, round 4): implemented `SLICE-4` on `feat/issue-16-ipc-workspace` from `f69ed76`. Feature ownership follows the existing boundaries (`read_file` in `projects/api` workspace, open targets in `files/api`, diff in `diff/api`, hooks in `hooks/api`). `read_file` keeps the port's nullable document and `open_in_target` the void response; `list_open_targets` is parameterless because it is machine-scoped. Hook decisions are project-scoped, so both hook requests carry `projectId` and no `runId`, with the closed `HookApprovalStatus` reused from the project catalog. The DTOs name the Shape/Limits/Authority tiers and defer enforcement to #20/#21/#24.
