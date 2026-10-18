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
| `SLICE-3` | Runs / subagents (stream union)              | pending   |
| `SLICE-4` | Workspace / files / diff / hooks             | pending   |

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

### SLICE-3 (pending)

Runs (`start_run`, `cancel_run`, `get_run`) and the six-kind `RunStreamEventDto` tagged union; subagents (`list_subagents`, `cancel_subagent`). Checks: exhaustive `assertNever` over the union; `seq`/`runId` on every frame; `StartRunRequest` carries no `approvalMode`.

### SLICE-4 (pending)

Workspace (`read_file`, `read_workspace_diff`, `list_open_targets`, `open_in_target`) and hooks (`list_hooks`, `set_hook_decision`) contracts + clients, each carrying the `projectId`/`runId` authority context. Checks: fixtures per command; authority fields present.

## Delivery, routing and risk

- **Delivery strategy:** `auto-chain`.
- **Chain strategy:** `feature-branch-chain` (see the tracker/child boundaries above). Tracker PR → `main` (draft, no-merge, `Closes #16`); slice-1 child PR → tracker branch (keeps `Closes #16`, no auto-close); slices 2–4 → immediate predecessor. Not `stacked-to-main`; the earlier plan is superseded.
- **Route / trigger:** multi-file cross-language change → delegated writer (Builder) in this isolated worktree, then independent Verifier, then functional-only QA. Slice 1 produces no UI surface, so its QA handoff is **functional-only**: no browser route, no visual baseline; QA re-runs the focused automated invocations.
- **Forecast:** ~2,300 authored lines across the four slices (Explorer forecast 2,200–2,400, advisory). Slice 1 forecast ~450. Advisory only; the kernel is not to be code-golfed under the budget at the cost of its tests or docs.
- **Review budget / `size:exception` recommendation:** slice 1 is **978 changed lines (978 additions, 0 deletions) across 15 files**, above the advisory 400; the maintainer authorized a `size:exception` for **PR #63 only** (issue #16 comment `6254393097`), and it does not transfer to slice 2. One honest slicing pass on slice 1 found no cohesive sub-slice: the closed error contract, its five cross-language fixtures, the TS and Rust contract suites and the slice-1 doc are one inseparable unit — a fixture-only or test-only slice would neither compile nor gate on its own, and `src/shared/ipc/client.ts` (46 lines) has no independent behavior without `contracts.ts`. The earlier 949 figure was `33bcd2d`; the frozen chain-accounting commit made it 978. Slices 2–4 each carry the same recommendation at their own boundary.

- **Slice-2 review budget:** slice 2 was implemented and measured in its own round (see the slice-2 delivery section below); it exceeds the advisory 400 for the same reason and its exact count and proposed split are recorded there.
- **Risk:** the error codes / DTO fields are public contract — renaming later cascades through #17–#27; slice 1 pins them exactly to `messages.ts` and the fixtures. Remote CI on this account has historically shown `startup_failure`; the real local checks are the evidence of record. Engram **is** available in this runtime, so the mirror below is a real save, not faked.
- **Corrected cosmetic deviation (round 2):** the earlier note claimed `docs/ipc/README.md` still said the slices ship "stacked-to-main". That is no longer true: commit `67bb1b9` corrected the README to the Feature Branch Chain wording, and `docs/ipc/README.md` now has zero occurrences of "stacked-to-main". The stale note is corrected here rather than left standing.
- **Runtime gotcha:** `@types/node` is not part of the `src` TypeScript program, so `node:fs`/`node:url` do not typecheck inside `src/**`. `tsconfig.json` is outside this slice's edit surface, so the shared fixtures are consumed from TS through `resolveJsonModule` imports instead.

## Tasks and progress

- [x] **T1 — ODD task file** (`SLICE-1` planning) before the first source write.
- [x] **T2 — Fixtures + Rust + TS contract tests (RED first)** then the shared kernel implementation (`SLICE-1`). Checks A1–A9.
- [x] **T3 — Slice-1 documentation** (`docs/ipc/README.md`).

T1–T3 are delivered by the frozen slice-1 implementation commit `33bcd2dc9674be7008ccb6aa57731b6044499c8a` on `feat/issue-16-ipc-kernel`, which is **preserved byte-for-byte** (not amended, rebased or squashed). The chain-strategy correction is recorded in a second, docs-only commit on the same branch. Both identities and the tracker branch are recorded in the issue #16 `Coder Agent says:` receipt and the PR bodies.

- [x] **T7 — Chain accounting** (`SLICE-1`): record the `feature-branch-chain` boundaries, the tracker branch and the actual checks in this document without rewriting T1–T3.
- [x] **T4 — SLICE-2** providers/projects/conversations: TS contracts + clients, Rust DTOs, shared command-envelope fixtures, cross-language contract tests and the `docs/ipc/README.md` catalog. Delivered by the slice-2 commit(s) on `feat/issue-16-ipc-catalog`; see the slice-2 delivery section below for the exact count and checks.
- [ ] **T5 — SLICE-3** runs/subagents. Pending.
- [ ] **T6 — SLICE-4** workspace/files/diff/hooks. Pending.

## Chain boundaries (actual)

| Role                 | Branch                             | Commit                              | Base               | Diff vs base                         |
| -------------------- | ---------------------------------- | ----------------------------------- | ------------------ | ------------------------------------ |
| Tracker / final      | `feat/issue-16-ipc-kernel-tracker` | `3e3e907`                           | `main` @ `6af748f` | empty tracker commit (0 files)       |
| Child PR 1 (slice 1) | `feat/issue-16-ipc-kernel`         | `33bcd2d` + chain-accounting commit | tracker branch     | 15 files, 978 additions, 0 deletions |
| Child PR 2 (slice 2) | `feat/issue-16-ipc-catalog`        | slice-2 commit(s)                   | child PR 1 branch  | see slice-2 delivery section         |
| Child PR 3 (slice 3) | not created                        | —                                   | child PR 2 branch  | pending                              |
| Child PR 4 (slice 4) | not created                        | —                                   | child PR 3 branch  | pending                              |

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

**Review-size gate (blocking).** Slice 2 is **31 files, 1577 additions, 38
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

**State.** No PR was opened and the branch was not pushed, so nothing oversized
or premature entered review. Labels were left as the orchestrator set them
(`ready-for-agent` on #16); no issue transition is implied by a blocked receipt.

## Log

- L1 (orchestrator handoff): implement `SLICE-1` only, four chained PRs, stacked-to-main, no PR/merge to `main`, no false pass.
- L2: Engram probe showed the tool store reachable, so the mirror was written and the "PENDING" assumption corrected.
- L3: `node:` builtins do not resolve in the `src` TS program; fixtures consume via `resolveJsonModule` without touching `tsconfig.json`.
- L4 (round-1 continuation, strategy correction): `stacked-to-main` was wrong for a four-slice chain because the first slice would have closed #16. Switched to `feature-branch-chain` with tracker `feat/issue-16-ipc-kernel-tracker`; the child PR keeps the judge-required `Closes #16` and stays safe because its base is a non-default branch. The frozen implementation commit `33bcd2d` was preserved and the correction was recorded in a separate docs-only commit.
- L5: every GREEN check in the table above was re-run from scratch in the round-1 continuation; the RED rows are carried-over observations and are labelled as such rather than claimed as fresh.
- L6 (slice 2, round 2): implemented `SLICE-2` contracts/clients/DTOs/fixtures/tests/docs on `feat/issue-16-ipc-catalog` from `67bb1b9`. Typed `satisfies`/typed-literal parity plus Rust `include_str!` round-trip keep both sides on the same fixture bytes.
- L7: `docs` is in `.prettierignore`, so slice-2 fixtures are not reformatted by `format:check`; they are still validated by both contract suites.
- L8 (review-size gate): slice 2 measures 1615 changed lines (1577 additions, 38 deletions, 31 files). One cohesive per-feature split still leaves projects (~555) and conversations (~447) above 400, so no cohesive ≤400 slice preserves the accepted deliverable; the Builder stopped before opening an oversized PR and returned `blocked` for a maintainer `size:exception` or a re-slice. Implementation preserved locally; no PR, no push, no label change.
