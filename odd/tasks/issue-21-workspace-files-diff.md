# Issue 21 — Rust: workspace file and diff service

## Objective and authority

Implement [issue #21](https://github.com/JoseCortezz25/nx-desktop/issues/21) on
branch `feat/issue-21-workspace-files-diff`, cut from `main` at `f978324`.
Issue #21 is blocked by #18, which is CLOSED and present on this base, so the
blocker is resolved. (#20 is still open on its own branch and is not required by
this ticket.)

The #16 contract (`workspace/dto.rs`, `files/dto.rs`, `diff/dto.rs`, the
fixtures and the TS clients) is the frozen wire shape. This issue implements its
four commands: `read_file`, `list_open_targets`, `open_in_target` and
`read_workspace_diff`. No frontend changes; the typed clients already exist.

## Specs

S1. Issue #21, "What to build": read file content, resolve open targets (editor,
reveal in the file manager per OS, copy path) and compute workspace diffs, all
through the path policy.

S2. Acceptance criterion: "Commands return file content and `DiffFile` DTOs" —
`read_file` returns `FileDocumentDto | null` and `read_workspace_diff` returns
the unified `DiffFileDto[]` fixture shape (clean workspace = `[]`).

S3. Acceptance criterion: "OS-specific reveal action chosen per platform" — the
open-target adapter builds `open -R` on macOS, `explorer /select,` on Windows
and `xdg-open <parent>` on Linux, and only when the OS tool exists.

S4. Acceptance criterion: "Paths validated through `path_policy`" — every
authority-bearing command resolves `projectId` to its workspace roots and
rejects `..`, absolute escapes and symlink escapes before any read or spawn.

S5. Acceptance criterion: "Follows the feature layout and the IPC contract
ticket" — `workspace/{domain,service,commands}.rs`, `files/{domain,ports,service,commands,adapters}.rs`,
`diff/{domain,ports,service,commands,adapters}.rs`; DTOs untouched; the four
commands registered in `generate_handler!`.

S6. Acceptance criterion: "No `.unwrap()` on fallible paths; no `MutexGuard`
held across `.await`" — project snapshots are cloned under short locks and the
blocking read / git process is awaited with no guard alive.

S7. Acceptance criterion: "`cargo test`, `cargo clippy -D warnings` and
`cargo fmt --check` pass" — path matrix, fixture parity, launch-plan matrix and
a real git adapter test.

## Design decisions

D1. **Read path.** `read_file` resolves the projects roots, runs
`path_policy::resolve_in_workspaces`, then reads through `spawn_blocking`.
Missing paths, directories and non-UTF-8 content resolve `null` (a path with no
document); a read above `MAX_DOCUMENT_BYTES` is a Limits failure.

D2. **Open targets are external actions only.** The closed vocabulary keeps all
five values, but the core launches only `editor` and `reveal_in_file_manager`;
`view_source`, `search_in_file` and `copy_path` are in-app UI actions and are
rejected with `permission_denied`. The `Abrir` menu still offers only VS Code
(§3.5 item 3); #21 implements the OS reveal action the acceptance requires even
though the menu does not surface it yet.

D3. **Launch plans are pure and testable.** `launch_plan(target, path, platform)`
returns program + argv (or “unavailable”); tests assert all three platforms
without spawning a GUI. The system adapter probes VS Code (`code` on `PATH`, the
macOS app bundle, the Windows `Code.exe` locations) and the OS reveal tool.

D4. **Diff source is a port.** `GitDiffSource` runs
`git --no-pager -c core.quotePath=false diff --no-ext-diff --no-textconv --no-color -U3 HEAD`
with an authorized `cwd`, a 10 s timeout and a 5 MiB output cap, then parses the
unified diff. Repos without `HEAD` fall back to `git diff --cached` + `git diff`
and merge by path. The panel never runs git itself.

D5. **First root for the diff.** The contract carries only `projectId`, and a
project may authorize several folders. `read_workspace_diff` inspects the first
authorized root; per-folder targeting needs its own contract field and is
documented as a limitation, not invented here.

D6. **No approval gate here.** File reads and editor launches are user-initiated
commands, not agent tool calls. The #20 approval matrix guards agent tools and
is not a dependency of this ticket.

## Open questions (documented, not guessed)

1. **Multi-folder diff targeting.** With no `folder` field in the frozen
   request, the first root is the only deterministic choice. A future contract
   change could add the folder or a per-folder response; until then the
   limitation is recorded here.
2. **Reveal in the menu.** The locked `Abrir` decision offers only VS Code, but
   the #21 acceptance explicitly requires the OS-specific reveal action. The
   core supports the action; the menu policy is unchanged and remains #12's.

## Tasks

T1. `projects/service.rs` — `workspace_roots(projectId)` authority snapshot
(S4, S5).
T2. `workspace/` — read service, path matrix, UTF-8/not-found/size outcomes and
`read_file` command (S1, S2, S4, S6).
T3. `files/` — open-target domain, launcher port, pure launch plans, system
probe/launcher, availability + open use cases and both commands (S1, S3, S4).
T4. `diff/` — unified diff domain, git source + parser, first-root service and
`read_workspace_diff` command (S2, S4, S5).
T5. `lib.rs` — manage the launcher/git source and register the four commands
(S5).
T6. Tests + docs — fixture parity, path escapes, launch plans, real git test,
task log and IPC doc registration note (S2–S7).

## Delivery, routing and risk

- **Delivery strategy:** single feature branch, one backend ticket.
- **Not in this issue:** frontend wiring (#24), an approval gate for agent tool
  calls (#20), a folder selector for multi-root diffs, and a full git status
  (untracked files are not part of `git diff`).
- **Risk:** (a) path authority is the same gate every file surface reuses —
  mitigated by the traversal/absolute/symlink matrix; (b) launching external
  processes is a security boundary — mitigated by argv arrays, allowlisted
  targets, authorized cwd and a probe before launch; (c) diff parsing is
  format-sensitive — mitigated by fixture-shaped parser tests and a real git
  integration test.

## Log

L1. User request verbatim: "toma el siguiente issue".

L2. Branch `feat/issue-21-workspace-files-diff` cut from `main` at `f978324`.
Issue #21 is the next unblocked backend ticket (#20 is still open on its own
branch and is not a dependency).

L3. Delivered in four commits:

| Slice | Commit    | Files                                                                                                | Authored lines |
| ----- | --------- | ---------------------------------------------------------------------------------------------------- | -------------- |
| 1     | `c15ce08` | `workspace/{mod,domain,service,commands}.rs`, `projects/service.rs`                                  | ~548           |
| 2     | `668cf15` | `files/{mod,domain,ports,service,commands}.rs`, `files/adapters/*`, `src/features/files/api`         | ~1,076         |
| 3     | `9ac4cdf` | `diff/{mod,domain,ports,service,commands}.rs`, `diff/adapters/*`, `Cargo.*`, `src/features/diff/api` | ~1,101         |
| 4     | `03cc8ed` | `lib.rs`, `docs/ipc/README.md`                                                                       | ~21            |

L4. Verification: `cargo test` (147 unit + 29 contract tests), `cargo clippy
--all-targets -- -D warnings`, `cargo fmt --check`, `pnpm run check` and
`pnpm test` (461 frontend tests) all green. The workspace, open-target and diff
fixtures are pinned byte-for-byte; the diff adapter also runs against real
temporary git repositories (clean, modified, staged-without-HEAD and non-repo).

L5. Scope notes made while implementing:

- `path` is strictly workspace-relative: an absolute request is rejected with
  `validation_failed` even when it points inside an authorized root.
- `read_file` checks metadata before loading bytes, so an oversized file is
  rejected before its content is read; missing paths, directories and non-UTF-8
  content resolve `null`.
- The diff inspects the project's first authorized root (the frozen request has
  no folder field), excludes untracked files (git diff semantics) and falls back
  to staged + unstaged patches when the repository has no `HEAD` commit.
- `reveal_in_file_manager` is implemented per OS as the acceptance requires,
  although the `Abrir` menu still offers only VS Code (§3.5 item 3). The three
  in-app targets are rejected by the core.
- Launching uses a probed absolute binary + argv, a cleared environment plus
  the OS desktop variables the launcher needs, null stdio and no shell.
- #20 remains open; the IPC registration note reflects #21 on this branch and
  will be reconciled when #20 lands.
