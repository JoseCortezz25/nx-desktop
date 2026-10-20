# Issue 22 — Connect UI to IPC: selectors, projects and sidebar

## Objective and authority

Implement [issue #22](https://github.com/JoseCortezz25/nx-desktop/issues/22) on
branch `feat/issue-22-ui-ipc-catalogs`, cut from `main` at `9056a21` (the merge
of #21). Its blockers (#7, #10, #17, #18) are CLOSED and present on this base.

The typed clients and DTOs from #16 already exist, as do the Rust commands from
#17/#18. This issue connects them: provider/model selectors, projects, the
sidebar's conversation list and the project's branch list read from the core
instead of the mock repositories, keeping the existing repository interfaces
and adding **file persistence** so projects and conversations survive an app
restart (the #18 stores are in-memory).

## Specs

S1. Issue #22, "What to build": replace the mock repositories behind providers,
models, projects and conversations with the typed IPC clients, keeping the same
interfaces.

S2. Acceptance: "Selectors list providers/models from Rust" — the provider
catalog hook consumes `list_providers` (which embeds each provider's models);
the selection chain keeps reconciling the same domain shapes.

S3. Acceptance: "Projects and conversations persist across restarts" — the Rust
core persists both stores to the Tauri app-data directory and reloads them on
startup. This is a backend addition required by the acceptance; #18 explicitly
shipped in-memory stores.

S4. Acceptance: "Zero raw `invoke` calls in components" — the new repositories
call the typed clients (`provider-client`, `project-client`,
`conversation-client`, `workspace-client`); components keep consuming feature
hooks and repository ports.

S5. Validation: automated client/repository and persistence tests, plus the
existing deterministic judges. Manual end-to-end remains for the reviewer in a
desktop session.

## Design decisions

D1. **Persistence is a Rust-core concern.** Two versioned JSON files live under
`app.path().app_data_dir()` (`projects.json`, `conversations.json`), written
atomically (temp file + rename) and loaded at startup with the fixture seed as
the fallback only when the file is absent. A corrupt file or an unsupported
version fails startup instead of silently discarding data.

D2. **Storage records are separate from DTOs and domain.** Each store keeps a
small serde record (`PersistedProject`, `PersistedConversation`, …) and maps it
to/from the domain, so the IPC wire contract and the domain stay untouched.

D3. **Repository adapters, not component changes.** `src/features/<feature>/api/`
gains `createIpc*Repository()` factories implementing the existing ports; the
hooks swap the mock factory for the IPC factory. UI tests keep mocking the port.

D4. **Deterministic counters survive restarts.** The next `proj-created-<n>` /
`conv-created-<n>` counter is derived from the loaded ids, so a restart cannot
reissue an id that already exists.

D5. **Scope boundaries.** The hook modal stays on its mock until #20's Rust
commands are merged; files/diff/open-targets stay on their mocks until #24.
Branches are wired because they belong to the active project's environment and
`list_workspace_branches` is already implemented (#18).

## Known data change

The Rust seed is the frozen #16 fixture: two projects and one conversation
(`conv-composer-chain`, two messages). The mock repositories carried extra
demo rows (Claude provider, `conv-diff-review`, `conv-hooks-review`, richer
messages). Wiring to the core intentionally replaces those placeholders with
the backend's real catalog/seed; richer rows return when real adapters
(#25–#27) and backend seeds land.

## Tasks

T1. `src-tauri/src/persistence.rs` — atomic versioned JSON load/save + tests.
T2. `projects/persistence.rs` + `ProjectStore` — load/seed/save, persist
create/approval/attach/detach, derived counter, tests (S3).
T3. `conversations/persistence.rs` + `ConversationStore` — same for
create/remove and the nested messages/tool activity, tests (S3).
T4. `lib.rs` — construct both stores with `app_data_dir()` in `setup`, map
persistence failures to internal errors (S3).
T5. Frontend IPC repositories for providers/projects/conversations/branches and
the hook swaps, with mapping/client tests (S1, S2, S4).
T6. Docs + judges — task log, comment updates, `pnpm run check`, Rust tests,
frontend tests (S5).

## Delivery, routing and risk

- **Delivery strategy:** single feature branch; persistence and UI wiring are
  one acceptance unit.
- **Risk:** (a) persistence is a new filesystem boundary — mitigated by a
  single atomic helper, version envelope, startup failure on corruption and
  round-trip tests; (b) swapping the data source visibly changes the demo
  catalog/seed — documented above; (c) `ProjectStore` also changes in the open
  #20 PR, so whichever merges second must reconcile and persist hook decisions.

## Log

L1. User request verbatim: "y continua con la siguiente" (after merging #21).

L2. Branch `feat/issue-22-ui-ipc-catalogs` cut from `main` at `9056a21`. The
next unblocked issue is #22; #20 is still open on its own branch and is not a
dependency, though it touches `ProjectStore` and will need a merge
reconciliation.

L3. Delivered in three commits:

| Slice | Commit    | Files                                                                                                  | Authored lines |
| ----- | --------- | ------------------------------------------------------------------------------------------------------ | -------------- |
| 1     | `751d9ea` | `diff/adapters/git.rs` (test isolation)                                                                | ~4             |
| 2     | `9d6bc22` | `persistence.rs`, `projects/{persistence,domain,service,commands,mod}.rs`, `conversations/*`, `lib.rs` | ~1,176         |
| 3     | `32e832f` | `src/features/{providers,projects,conversations}/api/*`, four hooks and their tests                    | ~565           |

L4. Verification: `cargo test` (164 unit + 29 contract tests), `cargo clippy
--all-targets -- -D warnings`, `cargo fmt --check`, `pnpm run check` and
`pnpm test` (470 frontend tests) all green. Persistence tests simulate a full
reload for created projects, approval-mode changes, conversation attachments,
created conversations and removals; corrupt/unsupported-version documents are
rejected.

L5. Scope notes made while implementing:

- The durable files are `projects.json` and `conversations.json` under
  `app.path().app_data_dir()`, each with a `version: 1` envelope. A missing file
  seeds from the fixture; a corrupt/unsupported file fails startup instead of
  silently discarding data.
- Creation counters are derived from loaded ids (`proj-created-<n>`,
  `conv-created-<n>`), so a restart cannot reissue an id.
- The app now reads the Rust catalog: the mock-only Claude provider, extra
  models and `conv-diff-review` / `conv-hooks-review` are gone until real
  adapters (#25–#27) or new seeds land. This is the documented data change.
- Branches are wired too (`list_workspace_branches`); the hook modal and the
  file/diff/open-target surfaces stay on mocks until #20/#24.
- `ProjectStore` is also modified by the open #20 PR. Whichever merges second
  must reconcile; #20's `set_hook_decision` must also call the persistence
  write once it lands.
- Manual end-to-end in a desktop session was not run in this agent environment;
  the reload behavior is covered by the store round-trip tests and the reviewer
  should perform the visual smoke test.
