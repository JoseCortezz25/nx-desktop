# Issue #9 — Create project dialog

## Objective and authority

Implement the complete create-project flow requested in [issue #9](https://github.com/JoseCortezz25/nx-desktop/issues/9), on `feat/issue-9-create-project-dialog` branched from main `529c19e9efe47467238fbd34c55bca553b3a1f38` after responsive shell #43 merged. The prior ownership blocker on `src/app/app-shell.tsx` is removed. Keep one `useProjectCatalog` owner in the app shell and share it with sidebar and composer; no backend IPC in this issue. Acceptance is the issue's dialog open/close, name validation, empty/folder states, submit creating a visible mock project, atomic-design direction, localized copy, typed mock data, and repo checks. Wireframes 04, 05, 06 and `docs/wireframes/README.md` are visual/flow references, not permission to hardcode placeholder data.

## Constraints and design uncertainty

The issue does not specify a unique-name rule, character restrictions, exact error copy, or where a mocked folder picker obtains data. Implement only minimal trimmed non-empty name validation; do not fabricate uniqueness/charset policy. Put neutral English UI copy in the existing i18n/messages architecture (follow repo rules). Mock folder selection must be typed, deterministic and visibly support both empty and folder-added states, never hardcode the wireframe's `nx-desktop` placeholder. If a user-visible product choice cannot be derived safely, stop and return the exact question rather than inventing business logic. The dialog is shell-level and must coexist with the #43 overlay/rail/composer at 900×700.

## Tasks

- [ ] T1 — Model and reusable components: create the shared Dialog molecule, project name validator, typed mock create/folder ports, create-project dialog and source-folder row, with focused tests. Route: delegated direct writer (multi-file implementation); trigger: architecture seams and >=2 nontrivial files. Risk: medium/unclear until review. Verification: observe RED for deterministic logic/interaction tests where runnable, GREEN, focused test/typecheck/lint/format:check and diff --check. Commit a coherent work unit on feature branch.
- [ ] T2 — Integrate and prove full flow: wire the project-picker row through composer to app-shell-owned catalog, show saved project consistently in picker/sidebar, and cover open/close, validation, empty/folder submit, backdrop/keyboard behavior and 900×700 layout without regressing #43. Route: delegated direct same writer, same worktree; trigger: multi-file seams. Risk: high if focus/overlay or shared state changes. Verification: focused tests plus applicable full checks and browser behavior; separate independent Verifier and QA after Builder PR. Commit work unit and record receipts.

## Scope, evidence and recovery

One feature branch and PR for the complete issue, not a partial slice presented as complete. Allowed source surfaces: `src/shared/ui/molecules/dialog.*`, `src/features/projects/{api,hooks,model,ui,messages*}/**`, `src/shared/ui/molecules/project-picker.*`, `src/shared/ui/organisms/composer.tsx`, `src/app/app-shell.tsx`, minimal related test files and existing i18n messages if necessary. Avoid unrelated shell CSS, global tokens, backend, or later issues. Preserve unrelated working-tree state. The Builder posts matching machine-checkable comments on issue and PR, judge passes current title/branch/body, and leaves `ready-for-review`. The orchestrator then gates Verifier → QA → merge; combined quality-failure cap 2 per PR.

Forecast authored changed lines: approximately 350–450; advisory only, not a cap. Delivery strategy: ask-on-risk if observed/forecast work crosses the repository's approximately 400-line PR strategy threshold; this is recorded before the relevant next commit, not silently ignored. Progress mirror: Engram integration is unavailable in this Hermes runtime; keep this file as the local recovery record and resynchronize when available. Next: Builder starts T1 after reading current main and repository rules.

## Builder plan and recorded delivery-strategy risk (2026-10-17)

Base `529c19e9efe47467238fbd34c55bca553b3a1f38` (post-#43 main), branch `feat/issue-9-create-project-dialog`, one PR. The #43 ownership blocker is gone; `src/app/app-shell.tsx` is free.

**Recorded delivery-strategy risk (not silently ignored):** the observed/forecast diff for the whole issue is well above the repository's advisory ~400-line threshold — two work units, ~17 source files (including 6 new files) plus 8 test files and this record. The pre-approved strategy from the dispatch envelope is a **single PR for the complete issue** ("implement full create-project dialog flow … in one PR"; "do not hand off a partial slice as done"), which is also the pattern issue #43 shipped and recorded here (`issue-43-responsive-layout.md`: forecast 400–650, one implementation commit, single PR). Splitting into chained PRs is therefore **not** selected silently; the one-PR strategy is the approved one, and the oversized-diff risk is carried into the handoff receipts for the orchestrator.

**Design decisions (no invented product policy):**

- One `useProjectCatalog` stays the only catalog owner; `createProject` is added to it and writes through the `ProjectRepository` port, returning the created project plus the updated list so the picker and the sidebar read one catalog.
- Name validation is the minimal trimmed non-empty rule only (`validateProjectName`); no uniqueness, charset, length or duplicate policy is invented. Error copy is neutral English in `src/features/projects/messages.ts`.
- The mocked folder source is a typed, deterministic catalog (`MOCK_SOURCE_FOLDERS` + `nextSourceFolder`) in `create-project.ts`; it never hardcodes the wireframe's `nx-desktop`. Adding folds in the next unused entry, so the empty and folder-added states are both reachable and reproducible.
- A project created from the empty state has **zero** source folders (the issue requires the empty state to submit) and starts at `ask_always`, the most restrictive approval level; both are honest defaults for a required field, not new business rules, and are recorded as risks.
- The dialog is a shared `Dialog` molecule (overlay, Escape, backdrop, initial focus) plus a feature-scoped `CreateProjectDialog` organism that is controlled by the shell: the shell holds `CreateProjectDraft | null` (null = closed), so the empty and folder-added states are directly observable in the node test runner.
- Stacking reuses `calc(var(--layer-composer) + 10)` from `tokens.css` instead of adding a token (`tokens.css` is out of the allowed surface).

**Untracked-file preservation:** this file was untracked on the assigned worktree and is committed before any source edit.
