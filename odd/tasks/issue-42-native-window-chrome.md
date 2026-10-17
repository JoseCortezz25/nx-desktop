# Issue 42 — native window chrome

Objective: Replace the fake frontend title/menu/window controls with OS chrome while retaining functional app region toggles. Issue: https://github.com/JoseCortezz25/nx-desktop/issues/42. Maintainer decision: https://github.com/JoseCortezz25/nx-desktop/issues/42#issuecomment-6239923847.

Scope: This issue only. Declare `Menu::default` in Rust; no application-specific menu commands. Move region toggles into the rail; remove decorative back/forward with a documented reason. Do not modify other feature behavior or add visual binary artifacts to the implementation branch.

- [x] T1 (delegated; medium/high cross-boundary): implementation and regression tests for native menu declaration, fake chrome removal, and preserved rail toggles. Observe a meaningful failing test first when runnable; run the focused TS/Rust checks and record commit identity.
  - RED (TS, before source edit): `pnpm test` → 5 failed / 206 passed (`rail.test.tsx` toggle cases, `app-shell.test.tsx` chrome-absence cases, `messages.test.ts` removed-copy case). Transcript: `docs/evidence/issue-42-round-1/t1-red-ts.txt`.
  - RED (Rust, test added before the declaration): `cargo test` → `error[E0432]: unresolved import 'super::default_app_menu'`. Transcript: `docs/evidence/issue-42-round-1/t1-red-rust.txt`.
  - GREEN: `pnpm test` 211 passed / 38 files; `cargo test` 1 passed. Transcripts: `t1-green-ts.txt`, `t1-green-rust.txt`, `final-*.txt`.
  - Implementation: declared `Menu::default` explicitly on every desktop platform in `src-tauri/src/lib.rs` (`#[cfg(desktop)]` + `Builder::menu`), with a compile-time signature test; deleted `title-bar.{tsx,css}`, `menu-bar.{tsx,css}`, `nav-history.{tsx,css}`, `window-controls.{tsx,css}`; moved the two region toggles into `rail.tsx`; removed the dead `--title-bar-height` token; dropped the drawn chrome copy from `messages.ts` (kept the toggle labels, moved to `rail`).
  - Commit: `24557e8` — `feat(shell): use the native menu and drop the drawn window chrome`.
- [x] T2 (delegated; passive documentation coupled to behavior): record the supersession and removed copy in the wireframe README and both byte-identical business-logic copies. Read back documentation, compare the copies, record commit identity.
  - `docs/wireframes/README.md`: ground rules bullet + "Layout regions" item 1 marked superseded by native chrome, naming the rail as the toggles' home and the back/forward removal.
  - `.claude/knowledge/business-logic.md` and `.opencode/knowledge/business-logic.md`: header note + new §3.7 (native frame kept, native menu from platform defaults with no product commands, region toggles in the rail, back/forward removed as decorative with the inert evidence). `diff` confirms byte-identical.
  - `.claude/rules/text-management.md` and `.opencode/rules/text-management.md`: the shared-messages rule no longer lists the removed window menu copy and states that native menu labels live in the Rust declaration. `diff` confirms byte-identical.
  - Commit: `7113b33` — `docs(shell): record the native window chrome supersession`.

Acceptance: Every criterion in issue #42, including inert-control evidence and browser DOM absence, with functional and app-content scoped-visual QA by a separate agent after an independent Verifier. Local checks are local, not GitHub Actions CI. Builder → Verifier → QA → merge.

Forecast: approximately 350–450 authored changed lines across deletion of obsolete chrome and focused tests; reassess before the next work-unit commit. Delivery strategy: single-pr for this cohesive issue, with test/docs evidence alongside implementation; no merge exception implied. Route: delegated direct for both tasks because this changes multiple non-trivial TS/Rust files and requires isolated verification. Current progress: T1 and T2 complete; all local checks green (see evidence transcript). Engram mirror: pending (Engram tools unavailable in this runtime). The branch is pushed and PR #46 is open with the Fabrica delivery title `Agent-42-native-window-chrome`; the `Coder Agent says:` receipt is on both the issue and the PR, and both sit in `ready-for-review`. Next: the orchestrator dispatches the Verifier.

## Local check transcript (Round 1, HEAD `7113b33` + untracked `odd/`)

Evidence branch `docs/evidence-issue-42-round-1` (separate from the PR branch, text only):

- `pnpm install --frozen-lockfile` → exit 0
- `pnpm test` → exit 0 (211 passed / 38 files)
- `pnpm run typecheck` → exit 0
- `pnpm run lint` → exit 0
- `pnpm run format:check` → exit 0
- `pnpm run build` → exit 0
- `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check` → exit 0
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` → exit 0
- `cargo test --manifest-path src-tauri/Cargo.toml` → exit 0 (1 passed)
- `git diff --check` → exit 0
- Dev-server DOM smoke (agent-browser 0.26.0, headless chromium, 1280x577, text only): `.title-bar` 0, `.menu-bar` 0, `.window-controls` 0, `.nav-history` 0, `.rail` 1 with 3 buttons; rail toggles flip `.sidebar` and `.right-panel` visibility and their `aria-pressed` state; all removed labels absent from the rendered text. Transcripts: `dom-smoke.txt`, `rail-toggle-smoke.txt`.

Not remote CI. GitHub Actions have an account-level `startup_failure`, so these are local runs only.

## Delivery

- PR: https://github.com/JoseCortezz25/nx-desktop/pull/46, Fabrica delivery title `Agent-42-native-window-chrome` (PR title corrected to this in Round 2), base `main`, Round 1 head `7113b33d7d29bad99f8594a0d0a73d349733f8d3`, mergeable.
- Receipts (identical on issue and PR): Round 1 https://github.com/JoseCortezz25/nx-desktop/issues/42#issuecomment-6240138218 and https://github.com/JoseCortezz25/nx-desktop/pull/46#issuecomment-6240138700; Round 2 handoff correction appended below the Round 1 receipt on both the issue and the PR.
- Round 2 (docs-only handoff correction): this file is committed as a documentation-only work unit on `feat/issue-42-native-window-chrome`. It adds no source or test bytes, so the Round 1 local behavioural proof above stays pinned to `7113b33`; the correction commit identity and the full 23-path PR file list are recorded in the Round 2 receipts on issue #42 and PR #46.
- Evidence branch (text only, never merged): `docs/evidence-issue-42-round-1` @ `86c9e077f68b5eb7a5ad0697271e91f616f24278`.
- Tracker state: issue #42 and PR #46 remain in `ready-for-review`; read back and confirmed. Next: the orchestrator dispatches the Verifier.
