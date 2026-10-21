# Issue 24 — Connect UI to IPC: files, diff and hooks

## Objective and authority

Implement [issue #24](https://github.com/JoseCortezz25/nx-desktop/issues/24) on
branch `feat/issue-24-ui-ipc-files-diff-hooks`, cut from `main` at `2da2b16`
(the merge of #20). Its backends are present on this base: `read_file`,
`list_open_targets`, `open_in_target` and `read_workspace_diff` (#21) and
`list_hooks` / `set_hook_decision` persisted through `ProjectStore` (#20).

The typed clients and DTOs from #16 already exist. This issue connects them: the
right panel's file viewer, the `Abrir` action, the `Cambios` diff view and the
hooks review modal read from (and write to) the Rust core instead of the mock
repositories.

## Specs

S1. Acceptance: "Opening a file chip shows real content" — the file viewer reads
the chip's workspace-relative path through `read_file`, scoped to the active
project.

S2. Acceptance: "Diff reflects the real workspace" — the `Cambios` tab reads
`read_workspace_diff` for the active project each time the view mounts.

S3. Acceptance: "Hooks modal lists real hooks and persists the user's decision"
— the modal lists `list_hooks` for the active project and every footer decision
is written through `set_hook_decision`; the list renders the hooks the core
returned.

S4. Validation: automated repository and hook tests, plus the existing
deterministic judges. Manual end-to-end in Tauri remains for the reviewer.

## Design decisions

D1. **Same pattern as #22.** Each surface gains a `createIpc*Repository()`
adapter in `src/features/<feature>/api/` implementing the existing port over the
existing typed client and mapping wire DTOs to domain types. The feature hooks
switch to the IPC adapter; the mock factories remain as test fixtures.

D2. **Project authority is bound at construction.** `read_file`,
`read_workspace_diff`, `list_hooks` and `set_hook_decision` are project-scoped,
so `createIpcFileRepository(projectId)`, `createIpcDiffRepository(projectId)`
and `createIpcHookRepository(projectId)` take the id and the ports keep their
path-only / parameterless shape. The open-target port's `openInTarget` gains a
`projectId` argument instead, because its machine report is project-free.

D3. **Rust owns hook decisions.** `useHookReview(projectId).decideHooks` writes
each id with `Promise.allSettled`, merges only the hooks the core returned
(`applyStoredHooks`) and reports a failure; there is no optimistic status. The
shell resolves the footer scope to ids (`resolveDecisionHookIds`) and closes the
modal only after every write was stored; otherwise it stays open with the error.

D4. **Stale responses are discarded.** Every hook tags its stored result with
the request it answers (`projectId`, and `path` for files) and the effect's
`isCancelled` guard drops superseded reads; a new request reads as loading until
its own answer lands, and a decision answer is never merged into another
project's list.

D5. **Loading and error states use message-map copy.** New entries in
`src/shared/i18n/messages.ts` (`fileViewer.noProjectLabel`, `errorLabel`,
`permissionDeniedLabel`, `openFailedLabel`; `diff.noProjectLabel`,
`errorLabel`) and `src/features/hooks/messages.ts` (`loadingLabel`,
`loadErrorLabel`, `emptyLabel`, `decisionErrorLabel`).

D6. **Node hook runner for tests.** `src/shared/testing/hook-runner.ts` is a
test-only `useState`/`useEffect` runtime (mocked in as `react`) plus deferred
promises, so the hook tests order late responses without a DOM.

D7. **No Rust change.** No backend gap blocked the UI.

## Known data change

The hooks modal now lists the core's hook source, which is still the
`FakeHookSource` fixture registered in `src-tauri/src/lib.rs` (#20); real
provider-reported hooks arrive with the provider adapters. Files and the diff
now show the active project's real workspace, so the mock samples (screen 18's
`+14 / -6`, the authored Markdown document) no longer appear in the running app.

## Tasks

T1. IPC adapters + tests: `files/api/ipc-file-repository.ts`,
`files/api/ipc-open-target-repository.ts`, `diff/api/ipc-diff-repository.ts`,
`hooks/api/ipc-hook-repository.ts` (S1–S3).
T2. Hooks: `useFileDocument(projectId, path)`, `useOpenTargets(projectId)`,
`useWorkspaceDiff(projectId)`, `useHookReview(projectId)` with error state,
stale-response guards and tests (S1–S3).
T3. Composition: `FilePanel` / `FileViewer` / `DiffView` take `projectId`; the
hooks dialog renders load/decision states; the shell passes the active project
and records decisions (S1–S3).
T4. Docs + judges — this log, `pnpm run check`, `pnpm test`,
`pnpm run rust:test` (S4).

## Delivery, routing and risk

- **Delivery strategy:** single feature branch; the four surfaces are one
  acceptance unit.
- **Risk:** (a) `src/app/app-shell.tsx` is also edited by the parallel #23
  branch — this diff is kept localized (hook call moved below the project
  catalog, `handleDecideHookReview` body, two prop additions); (b) the hook list
  is the backend fixture until real providers land.

## Log

L1. Delivered in two commits: the UI wiring (`feat(workspace)`) and this
evidence (`docs(odd)`).

L2. Verification: `pnpm run check` (Prettier, ESLint, `tsc`, `cargo fmt
--check`, `cargo clippy --all-targets -D warnings`), `pnpm test` (86 files,
522 tests) and `pnpm run rust:test` (208 unit + 29 contract tests) all green.

L3. Manual end-to-end in a Tauri desktop session was not run in this agent
environment. The reviewer should: open a file chip and see the workspace file;
try a path outside the workspace and see the permission copy; open `Cambios`
after editing a file and see the change; decide hooks in the modal, restart the
app and confirm the decision persisted.
