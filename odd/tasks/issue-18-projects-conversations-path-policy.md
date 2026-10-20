# Issue 18 — Rust: projects, conversations and workspace path policy

## Objective and authority

Implement [issue #18](https://github.com/JoseCortezz25/nx-desktop/issues/18) on
branch `feat/issue-18-projects-conversations-path-policy`, cut from the tip of
`feat/issue-17-provider-registry` (`c4ffd22`). Blocked by #16, which is CLOSED
(contract integrated into `main` and present on this base), so the blocker is
resolved.

The #16 contract (DTOs in `src-tauri/src/features/projects/dto.rs`,
`src-tauri/src/features/conversations/dto.rs`, fixtures
`projects-*.json` / `conversations-*.json`, TS clients `listProjects` /
`createProject` / `setProjectApprovalMode` / `listWorkspaceBranches` /
`listConversations` / `createConversation`) is the frozen wire shape. This issue
adds the Rust domain, services, commands and `path_policy` — no real git
branch discovery (per-project branch map seeded from the fixture, real `git`
belongs to a later ticket), no file persistence (in-memory managed stores that
survive across commands), and no frontend changes (the TS clients already exist
and stay untouched).

## Specs

S1. Issue #18, "What to build": "Persisted projects and conversations, plus
`path_policy` that canonicalizes workspace paths and enforces authorized
folders."

S2. Acceptance criterion: "Create/list projects and conversations through
commands" — `list_projects` (parameterless → `ProjectDto[]`),
`create_project` (`{ request: { name, folders } }` → `CreatedProjectDto`),
`set_project_approval_mode`
(`{ request: { projectId, approvalMode } }` → `ProjectDto[]`),
`list_workspace_branches` (`{ request: { projectId } }` → `string[]`),
`list_conversations` (parameterless → `ConversationDto[]`),
`create_conversation` (`{ request: { projectId, title? } }` → `ConversationDto`),
registered in `generate_handler!`, returning `Result<TDto, AppErrorDto>` with
the exact fixture wire shapes.

S3. Acceptance criterion: "Paths outside authorized workspaces are rejected" —
every authority-bearing command resolves `projectId` to its canonicalized roots
and rejects unknown projects with `permission_denied`; `create_project`
canonicalizes each folder and rejects escapes with `permission_denied`;
`read_file`/`open_in_target` enforcement itself belongs to #21, which reuses
the `path_policy` built here.

S4. Acceptance criterion: "Path traversal and symlink cases tested" — unit
tests for `..` traversal, absolute-path escape, prefix-sibling confusion
(`/workspace/api-client` vs `/workspace/api-client-evil`), and symlink escape
(canonicalized target outside roots); symlink tests build temp dirs under
`std::env::temp_dir`, never inside the repo.

S5. Acceptance criterion: "Follows the feature layout (`domain.rs`, `ports.rs`,
`service.rs`, `commands.rs`) and the IPC contract ticket" — DTOs stay in the
existing `dto.rs` files untouched; domain has no Tauri/Serde-wire deps; one
shared `security/path_policy.rs` (canonicalize + scope check, no Tauri);
`ports.rs` only where a real external seam exists (branch source); services own
the use cases; commands stay thin adapters.

S6. Acceptance criterion: "No `.unwrap()` on fallible paths; no `MutexGuard`
held across `.await`" — stores use `std::sync::Mutex` with short lock scopes
(clone under lock, drop guard, then compute); errors propagate with `?` into
`AppErrorDto`. No async I/O in this issue, so the guard rule holds by
construction and tests assert it by inspection.

S7. Acceptance criterion: "`cargo test`, `cargo clippy -D warnings` and `cargo
fmt --check` pass" — unit tests for domain invariants, `path_policy` escapes,
service selection/authority validation, command error mapping; existing
`ipc_contract.rs` fixtures must keep passing byte-for-byte.

S8. Seed data rule: the in-memory seed mirrors the #16 fixture rows
(`proj-design-system`, `proj-api-client`, their conversations, the per-project
branch lists) so service output matches the pinned wire shapes; created ids are
deterministic counters (`proj-created-<n>`, `conv-created-<n>`), never
name-derived slugs; a created project starts at `ask_always` and a created
conversation derives its title from the request or defaults per the mock; no
new seed rows beyond the fixture rows.

## Tasks

T1. `projects/domain.rs` + `conversations/domain.rs` — `ProjectId`,
`ProjectName`, `ConversationId`, title derivation, approval-mode and
membership invariants (S2, S5).
T2. `security/path_policy.rs` — root canonicalization, workspace-relative join,
traversal/symlink/prefix-sibling rejection, pure functions without Tauri (S1,
S3, S4, S5).
T3. `projects/service.rs` + `conversations/service.rs` — `ProjectStore` and
`ConversationStore` (`Mutex`-guarded, seeded from fixture rows, deterministic
counter ids, short lock scopes, Shape/Limits/Invariants/Authority tiers)
(S1, S2, S3, S6, S8).
T4. `projects/commands.rs` + `conversations/commands.rs` + `lib.rs` wiring —
six thin commands, `AppErrorDto` mapping (`validation_failed` for shape/limits/
invariants, `permission_denied` for authority) with `request_id`,
`generate_handler!` registration (S2, S3, S6).
T5. Tests + judges — unit/integration tests for T1–T4 including the S4 escape
matrix, then `cargo test`, `cargo clippy -- -D warnings`, `cargo fmt --check`
green with `ipc_contract.rs` still byte-for-byte (S7).

## Delivery, routing and risk

- **Delivery strategy:** single feature branch (`feat/issue-18-projects-conversations-path-policy`), cut from the #17 tip. No chained PRs: #18 is one backend ticket behind one issue.
- **Commit slices (actual):**

| Slice | Commit    | Files                                                              | Authored lines |
| ----- | --------- | ------------------------------------------------------------------ | -------------- |
| 1     | `5c02fa4` | `security/mod.rs`, `security/path_policy.rs`                        | ~345           |
| 2     | `d0d3c76` | `projects/{mod,domain,service,commands}.rs`                         | ~875           |
| 3     | `824b965` | `conversations/{mod,domain,service,commands}.rs`, `features/mod.rs`, `lib.rs` | ~785 |

- **Review-size note:** the ticket is ~2,000 authored lines across three slices, above the advisory 400-line work unit. One honest splitting pass found no smaller cohesive unit below these three: the path policy carries its own escape matrix, the project store carries the seed plus creation/authority rules, and the conversation store carries the clock plus the two-store creation rollback. Factoring these smaller would ship slices that cannot be verified on their own. Aggregate sits below the #16 slice-3 (1,451) and slice-4 (1,496) units the maintainer already accepted; if review prefers smaller, the honest cut is slice 2 → (domain+service) and (commands+wiring), not per-file.
- **Route / trigger:** single backend unit of behavior (one ticket, one boundary) — implemented inline by the parent; the writer trigger did not fire because this is one cohesive unit, not two independent ones.
- **Risk:** item 2 (security — `path_policy` is the authority gate every later file read/diff/open target reuses in #21; a wrong containment check silently authorizes out-of-workspace reads) and item 3 (contract consumers — six commands now occupy the frozen `#16` wire shapes, and `create_conversation` changes another feature's store state). Mitigated by the S4 escape matrix (traversal, absolute, prefix-sibling, symlink) and by fixture-pinned output tests on both DTO surfaces.
- **Not in this issue:** real `git` branch discovery (`list_workspace_branches` serves the seeded per-project map), file persistence (in-memory managed stores), `read_file`/`open_in_target` enforcement (#21 reuses `path_policy`), and any frontend wiring (TS clients already exist from #16).

## Log

L1. User request verbatim: "audame a tratar la issue 18 en una nueva rama y con base a la 17".

L2. Branch `feat/issue-18-projects-conversations-path-policy` cut from
`feat/issue-17-provider-registry` tip `c4ffd22`; tree was dirty with local
`.gitignore` (`/.npm/`) + untracked `.npmrc` from the npm runtime, cleaned with
`git restore .gitignore` + `rm .npmrc` before branching.

L3. Implemented T1–T5 on `feat/issue-18-projects-conversations-path-policy`
(2026-10-20): `security/path_policy.rs` (canonicalize + scope check, escape
matrix: traversal / absolute / prefix-sibling / symlink), `projects/domain.rs`
(ids, name rule, approval policy), `projects/service.rs` (`ProjectStore`,
fixture seed, counter ids, short `Mutex` scopes), `conversations/domain.rs` +
`service.rs` (`ConversationStore`, injectable `Clock`, fixture seed),
`projects/commands.rs` + `conversations/commands.rs` (six commands with
`AppErrorDto` mapping), `lib.rs` (`manage` + `generate_handler!`). Covers
S1–S8. Evidence: `cargo test` 58 unit + 29 contract green, `cargo clippy --
-D warnings` clean, `cargo fmt --check` clean, `pnpm typecheck` clean.
