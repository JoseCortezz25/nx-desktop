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
- The tracker and the children are separate branches sharing one `main` fork point, so GitHub's three-dot diff shows only the child's own commit (949 added lines across 15 files, no tracker scaffolding).

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

| ID        | Slice                                        | Status  |
| --------- | -------------------------------------------- | ------- |
| `SLICE-1` | Shared kernel (error + invoke/channel)       | current |
| `SLICE-2` | Providers / projects / conversations catalog | pending |
| `SLICE-3` | Runs / subagents (stream union)              | pending |
| `SLICE-4` | Workspace / files / diff / hooks             | pending |

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

### SLICE-2 (pending)

Providers (`list_providers`, `list_models`), projects (`list_projects`, `create_project`, `set_project_approval_mode`, `list_workspace_branches`), conversations (`list_conversations`, `create_conversation`) contracts + clients. Checks: same command set; request/response fixtures; `CreatedProjectDto` / `ProjectDto[]` shapes preserved.

### SLICE-3 (pending)

Runs (`start_run`, `cancel_run`, `get_run`) and the six-kind `RunStreamEventDto` tagged union; subagents (`list_subagents`, `cancel_subagent`). Checks: exhaustive `assertNever` over the union; `seq`/`runId` on every frame; `StartRunRequest` carries no `approvalMode`.

### SLICE-4 (pending)

Workspace (`read_file`, `read_workspace_diff`, `list_open_targets`, `open_in_target`) and hooks (`list_hooks`, `set_hook_decision`) contracts + clients, each carrying the `projectId`/`runId` authority context. Checks: fixtures per command; authority fields present.

## Delivery, routing and risk

- **Delivery strategy:** `auto-chain`.
- **Chain strategy:** `feature-branch-chain` (see the tracker/child boundaries above). Tracker PR → `main` (draft, no-merge, `Closes #16`); slice-1 child PR → tracker branch (keeps `Closes #16`, no auto-close); slices 2–4 → immediate predecessor. Not `stacked-to-main`; the earlier plan is superseded.
- **Route / trigger:** multi-file cross-language change → delegated writer (Builder) in this isolated worktree, then independent Verifier, then functional-only QA. Slice 1 produces no UI surface, so its QA handoff is **functional-only**: no browser route, no visual baseline; QA re-runs the focused automated invocations.
- **Forecast:** ~2,300 authored lines across the four slices (Explorer forecast 2,200–2,400, advisory). Slice 1 forecast ~450. Advisory only; the kernel is not to be code-golfed under the budget at the cost of its tests or docs.
- **Review budget / `size:exception` recommendation:** slice 1 is **949 changed lines (949 additions, 0 deletions) across 15 files**, above the advisory 400. One honest slicing pass finds no cohesive sub-slice: the closed error contract, its five cross-language fixtures, the TS and Rust contract suites and the slice-1 doc are one inseparable unit — a fixture-only or test-only slice would neither compile nor gate on its own, and `src/shared/ipc/client.ts` (46 lines) has no independent behavior without `contracts.ts`. Recommend a maintainer **`size:exception`** for slice 1 rather than code golf (no comment, doc or test was removed or compressed to reach a number). Slices 2–4 each forecast 500–650 lines and carry the same recommendation at their own boundary.
- **Risk:** the error codes / DTO fields are public contract — renaming later cascades through #17–#27; slice 1 pins them exactly to `messages.ts` and the fixtures. Remote CI on this account has historically shown `startup_failure`; the real local checks are the evidence of record. Engram **is** available in this runtime, so the mirror below is a real save, not faked.
- **Known cosmetic deviation:** `docs/ipc/README.md` still says the four slices ship "stacked-to-main" in its _Delivery slices_ note. This round's authorized edit surface is this task document only, so the stale phrase is recorded here rather than edited; a later slice's doc pass (or the Verifier) should correct it to `feature-branch-chain`. It has no functional effect — slice 1 registers no commands.
- **Runtime gotcha:** `@types/node` is not part of the `src` TypeScript program, so `node:fs`/`node:url` do not typecheck inside `src/**`. `tsconfig.json` is outside this slice's edit surface, so the shared fixtures are consumed from TS through `resolveJsonModule` imports instead.

## Tasks and progress

- [x] **T1 — ODD task file** (`SLICE-1` planning) before the first source write.
- [x] **T2 — Fixtures + Rust + TS contract tests (RED first)** then the shared kernel implementation (`SLICE-1`). Checks A1–A9.
- [x] **T3 — Slice-1 documentation** (`docs/ipc/README.md`).

T1–T3 are delivered by the frozen slice-1 implementation commit `33bcd2dc9674be7008ccb6aa57731b6044499c8a` on `feat/issue-16-ipc-kernel`, which is **preserved byte-for-byte** (not amended, rebased or squashed). The chain-strategy correction is recorded in a second, docs-only commit on the same branch. Both identities and the tracker branch are recorded in the issue #16 `Coder Agent says:` receipt and the PR bodies.

- [x] **T7 — Chain accounting** (`SLICE-1`): record the `feature-branch-chain` boundaries, the tracker branch and the actual checks in this document without rewriting T1–T3.
- [ ] **T4 — SLICE-2** providers/projects/conversations. Pending.
- [ ] **T5 — SLICE-3** runs/subagents. Pending.
- [ ] **T6 — SLICE-4** workspace/files/diff/hooks. Pending.

## Chain boundaries (actual)

| Role                 | Branch                             | Commit                              | Base               | Diff vs base                         |
| -------------------- | ---------------------------------- | ----------------------------------- | ------------------ | ------------------------------------ |
| Tracker / final      | `feat/issue-16-ipc-kernel-tracker` | `3e3e907`                           | `main` @ `6af748f` | empty tracker commit (0 files)       |
| Child PR 1 (slice 1) | `feat/issue-16-ipc-kernel`         | `33bcd2d` + chain-accounting commit | tracker branch     | 15 files, 949 additions, 0 deletions |
| Child PR 2 (slice 2) | not created                        | —                                   | child PR 1 branch  | pending                              |
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

## Log

- L1 (orchestrator handoff): implement `SLICE-1` only, four chained PRs, stacked-to-main, no PR/merge to `main`, no false pass.
- L2: Engram probe showed the tool store reachable, so the mirror was written and the "PENDING" assumption corrected.
- L3: `node:` builtins do not resolve in the `src` TS program; fixtures consume via `resolveJsonModule` without touching `tsconfig.json`.
- L4 (round-1 continuation, strategy correction): `stacked-to-main` was wrong for a four-slice chain because the first slice would have closed #16. Switched to `feature-branch-chain` with tracker `feat/issue-16-ipc-kernel-tracker`; the child PR keeps the judge-required `Closes #16` and stays safe because its base is a non-default branch. The frozen implementation commit `33bcd2d` was preserved and the correction was recorded in a separate docs-only commit.
- L5: every GREEN check in the table above was re-run from scratch in the round-1 continuation; the RED rows are carried-over observations and are labelled as such rather than claimed as fresh.
