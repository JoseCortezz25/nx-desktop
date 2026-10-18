# Issue 13 — Diff view

## Objective and authority

Implement [issue #13](https://github.com/JoseCortezz25/nx-desktop/issues/13) against merged base `9af62b0` (`main`, all checks green: 42 test files / 263 tests, `format:check`, `lint`, `typecheck` clean).

Branch `feat/issue-13-diff-view` in isolated worktree `~/.fabrica/workspaces/nx-desktop/issue-13`.

The maintainer set the scope of this delivery on top of the issue's acceptance criteria: **the full screen 18 surface** — `DiffView` in the right panel _and_ the way it is reached — not just the isolated organism. `split` stays deferred (locked decision, `.claude/knowledge/business-logic.md` §3.5 item 1); no IPC, no Rust, no provider contracts.

## Specs

S1. Issue #13, "What to build": "`DiffView` in the right panel: per-file collapsible sections with added/removed counts, hunk headers, added lines in green and removed lines in red. Unified mode first; split mode is an open question."

S2. Acceptance criterion: "Sections collapse and expand".

S3. Acceptance criterion: "Added/removed styling and counts are correct for mock data".

S4. Acceptance criterion: "Components classified into `atoms/`, `molecules/`, `organisms/` with correct import direction".

S5. Acceptance criterion: "All UI copy lives in `messages.ts`; no wireframe placeholder text hardcoded (`ChatGPT`, `GPT-6.1 Sol`, ...)".

S6. Acceptance criterion: "Data comes from typed interfaces backed by mock data (no IPC yet)".

S7. Acceptance criterion: "`pnpm typecheck`, `pnpm lint` and `pnpm format:check` pass".

S8. Locked decision (`business-logic.md` §3.5 item 1): "**`DiffView` Modes** (ticket #13): `unified` only. The wireframe toolbar draws `unified` and `split`, but only `unified` is in scope; `split` is deferred." The drawn `Vista dividida` / `Vista unificada` control is therefore **not** built and no toggle state exists.

S9. Maintainer scope decision (this delivery): "Wireframe 18 completo" — the diff is reachable inside the right panel (a `Cambios` tab in the panel's tab strip, screen 18) and the conversation's diff tool-activity rows open it. Screen 18's `Abrir` split button is **not** built here: the same `OpenWithMenu` already belongs to `FileViewer` (#12), and #13's acceptance criteria do not ask for a second copy.

S10. Existing contracts that must keep working: opening a file from a `FileChip` still opens/focuses its file tab (`shell-state.ts` `revealFileInPanel`, `file-tabs.ts` rules); the panel keeps its tab working set across a close/reopen and an overlay/column switch (#12, #40, #43).

## Tasks

- [x] T1 — `src/features/diff` typed data seam: the existing shared `DiffFile` domain type, a `DiffRepository` port, a mock repository with the screen 18 changes, the loading hook, and the pure model (`buildHunkRows` gutters, `countDiffLines`, `summarizeDiff`, `toggleDiffSection`). Tests for the pure logic and for the seed's own consistency. S3, S5, S6. Commit `5920760`.
- [x] T2 — `DiffView` rendering: `diff-hunk-table` and `diff-file-section` molecules, the `DiffView` organism with its summary bar and the collapsed-set owner, copy through `messages.ts`, diff colour tokens in `tokens.css`. Tests. S1, S2, S3, S4, S5, S8. Commit `5c4802c`.
- [x] T3 — Reachability: `ToolCallKind` gains `diff`, the row becomes a control only for that kind, the panel's tab model gains the single `Cambios` tab (drawn without a close control), the shell owns an `openChangesRequestCount` and `revealChangesInPanel`. Tests, including the S10 regressions. S9, S10. Commit `8e10fae`.

## Log

L1 (maintainer, verbatim): "Necesito que te bajes los cambios, y con base a main comiences a trabajar en una nueva rama para el issue 13 que esta en este repo"

L2 (maintainer decisions, this session): scope = "Wireframe 18 completo"; workspace = isolated worktree (`~/.fabrica/workspaces/nx-desktop/issue-13`).

L3 (base evidence): `main` @ `9af62b0`; `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck` clean and `pnpm test` 42 files / 263 tests passing before the first edit.

## Verification observed (builder self-check — not QA)

Base `9af62b0` was green before the first edit: 42 test files / 263 tests, `format:check`, `lint`, `typecheck` clean. After the change:

| Check                   | Result                                             |
| ----------------------- | -------------------------------------------------- |
| `pnpm test`             | 307 passed (48 files); +44 tests over the base     |
| `pnpm run typecheck`    | clean                                              |
| `pnpm run lint`         | clean                                              |
| `pnpm run format:check` | clean                                              |
| `git diff --check`      | clean (no trailing whitespace or conflict markers) |

Every rule has a test that observes its effect at the rule or component level, in the repository's node-only style (`renderToStaticMarkup` plus pure-model tests; `@testing-library` is not installed and was not added). That runner renders a **static** tree: it cannot press a mounted control, wait for a re-render or follow a `setState`. The interaction flows below are therefore observed in the browser check, not in the suite, and the suite claims no more than that:

- S1/S3 — `diff-view.test.ts` derives both gutters from the hunk header, keeps the two sides independent and leaves the numbers empty on an unreadable header; `mock-diff-repository.test.ts` proves every shipped file's declared counts equal the counts its own lines produce, and that the seed totals are the wireframe's `+14` / `-6`.
- S2 — `toggleDiffSection` collapses and expands one path without mutating the input; `diff-file-section.test.tsx` renders the expanded and the collapsed state, with `aria-expanded` and the body absent when collapsed.
- S3/S8 — `diff-hunk-table.test.tsx` asserts the per-kind row class, the printed marker and both gutters; no `split` control exists anywhere in the delivery.
- S5 — every string the diff surface prints comes from `sharedMessages.diff`; the mock bodies are file content (data), not UI copy.
- S9/S10 — `file-tabs.test.ts` pins the changes-tab rules next to the untouched file-tab rules; `file-panel.test.tsx` keeps every #12/#40/#43 expectation green, adds the `Cambios` focus and pins the `changes`-path identity case; `shell-state.test.ts` proves `revealChangesInPanel` reveals the region and increments the counter; `app-shell-panel-seam.test.tsx` and `app-shell-navigation-seam.test.tsx` prove the panel is handed the shell's counter value, that the conversation's `onRequestOpenChanges` handler is the shell's, and that this handler delegates to the real transition; `tool-activity-row.test.tsx` proves a non-diff row is still inert. **Not** proven by the suite: the panel receiving the _incremented_ value on a later render, a second press on a mounted panel, focus restoration through real events, and close/reopen or overlay↔column persistence of the changes tab. The browser check exercised the press → reveal → tab → sections → collapse chain once, on the mock data.

Browser check of the real surface (Vite dev server on the mock repositories, agent-browser, window 1280x577, conversation `Diff review panel`):

- the `git diff` activity row renders as a control named `Abrir los cambios en el panel derecho`, and pressing it reveals the right panel on a selected `Cambios` tab;
- the summary bar reads `2 archivos cambiados +14 -6`, and the two sections read `src/App.tsx +9 -4` and `src-tauri/src/lib.rs +5 -2`;
- each section expands to its hunk tables with both gutters, blue-grey hunk headers, green added rows and red removed rows, and the chevron collapses one section to its header while the other keeps its tables;
- a screenshot was compared side by side with `docs/wireframes/18-chat-with-diff.html`: layout, colour treatment, gutters, markers, counts and tab all correspond.

Still pending, and not claimed by this round: the formal independent visual/functional QA pass on its own evidence branch (the issue's stated validation type, delivered for #42/#43 with annotated screenshots).

## Round 2 — verification findings and fixes (2026-10-18)

An independent verifier reviewed the three implementation commits and returned **FAIL** with one high finding, one medium and two low ones. All four were addressed in the branch; nothing was waived.

| Finding                                                                                                                             | Severity | Resolution                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The changes tab id `changes` collided with a workspace file of the same name: the wrong tab was focused, or a file tab never opened | High     | File tab ids are now namespaced (`fileTabId(path)` returns `file:<path>`), so the two id spaces cannot meet. RED observed first: `openFileTab(openChangesTab(...), 'changes')` produced one tab instead of two. Commit `9642919`.                                                                                                                  |
| Tests did not observe two presses, refocus after a file tab, or a request for a file named `changes`                                | Medium   | Added the panel-level identity test (a file `changes` keeps its own tab and viewer, with and without a change-set tab) and the model test that a repeated `openChangesTab` refocuses the single tab. The static-render harness cannot simulate a second press on a mounted panel; that limit is stated rather than papered over. Commit `9642919`. |
| Hunk header parsing accepted impossible ranges (`@@ -0 +0 @@`) and silently rounded offsets past 2^53                               | Low      | `readStartNumber` requires a positive safe integer; otherwise the gutters stay empty. RED observed first with both inputs printing wrong numbers. Commit `200a89e`.                                                                                                                                                                                |
| Three departures from the wireframe were not recorded                                                                               | Low      | Recorded below in L7.                                                                                                                                                                                                                                                                                                                              |

After the fixes: `pnpm test` 306 passed (48 files), `typecheck`, `lint`, `format:check` and `git diff --check` clean.

## Round 3 — second verification pass (2026-10-18)

A second independent pass re-checked the round-2 fixes: the id collision (PASS), the recorded deviations (PASS), the test-honesty finding (PASS WITH FINDINGS) and the hunk numbering (FAIL).

| Finding                                                                                                                                                                                    | Severity | Resolution                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A validated start could still be advanced past the exactly representable range: with `@@ -9007199254740991,3 +1,3 @@` the third gutter printed `9007199254740992` twice instead of `...93` | High     | `advance` now returns no number when the next value is not a safe integer, so that gutter stops while the other keeps counting. RED observed first (the new test failed on the duplicate). Commit `6997c02`. |
| The record claimed more proof than the suite delivers (interaction flows the static runner cannot observe)                                                                                 | Medium   | The verification section now separates what the suite proves from what only the browser check observed, and names the four behaviours that stay unproven by automation. Same commit.                         |

After the fixes: `pnpm test` 307 passed (48 files), `typecheck`, `lint`, `format:check` and `git diff --check` clean.

## Delivery and progress

Three work-unit commits on `feat/issue-13-diff-view`, in reviewable slices:

| Commit    | Slice                                                     | Authored lines |
| --------- | --------------------------------------------------------- | -------------- |
| `5920760` | diff data seam (port, mock seed, hook, pure model)        | ~600           |
| `5c4802c` | diff rendering (tokens, copy, two molecules, organism)    | ~700           |
| `8e10fae` | reachability (domain kind, row control, tab model, shell) | ~440           |

Total ≈2043 authored changed lines, past the ~400-line review slice. The recorded delivery strategy is **two chained PRs** so each slice is reviewable on its own: PR 1 = `5920760..5c4802c` plus the two verification fixes (the `DiffView` surface and its tab model, satisfying S1-S8 on its own), PR 2 = `8e10fae` (reachability, S9-S10, based on PR 1's branch). A single PR remains the maintainer's call; the commits are already split so either works. Push, PR creation and merge are the maintainer's decisions, not this record's.

Next step after the builder round: independent verification (this diff changes an additive domain contract and shared component props, Risk item 3), then the independent visual/functional QA round against wireframe 18.

## Log

L1 (maintainer, verbatim): "Necesito que te bajes los cambios, y con base a main comiences a trabajar en una nueva rama para el issue 13 que esta en este repo"

L2 (maintainer decisions, this session): scope = "Wireframe 18 completo"; workspace = isolated worktree (`~/.fabrica/workspaces/nx-desktop/issue-13`).

L3 (base evidence): `main` @ `9af62b0`; `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck` clean and `pnpm test` 42 files / 263 tests passing before the first edit.

L4 (delegation): T1 and T2 were implemented inline by the parent (test-first: RED observed on the missing modules, then GREEN). T3 was delegated to a bounded writer with an explicit allowlist after the parent's context hit the backstop; it stopped once at a scope conflict (`src/shared/ui/organisms/conversation-messages.test.tsx` needed the new required prop) and the parent authorized exactly that one extra path.

L5 (deviation, recorded not silent): the wireframe's diff summary bar also prints the workspace name and draws a copy control, the `Vista dividida` / `Vista unificada` toggle and an `Abrir` split button. The bar prints the changed-file count and the `+N` / `-N` totals only: the workspace name is the active project's data (#8), `split` is deferred by the locked decision (S8), and `Abrir` already belongs to the file viewer's `OpenWithMenu` (#12), so neither control is duplicated here. Code lines wrap instead of clipping (`overflow: hidden` in the wireframe assumed a wider pane than the 460px region) so no diff line becomes unreadable.

L6 (verification round, 2026-10-18): an independent verifier returned FAIL on the first candidate. The high finding was a real identity collision between the change-set tab and a file named `changes`; the medium finding was test coverage that asserted the initial handoff instead of a repeated request; the low findings were unchecked hunk-header numbers and three unrecorded wireframe departures. All were fixed in `9642919` and `200a89e` with RED observed before each fix, and the round is recorded above.

L7 (further deviations from the wireframe, recorded not silent): every section starts **expanded** (screen 18 draws the second file collapsed, which is a state, not a default); code lines are drawn as plain monospace text without the wireframe's keyword/string/comment colouring, because the domain carries `kind` and `content` only and no tokenizer is in scope; the tab strip draws no `+` tab-add control and no expand/layout controls, which belong to no ticket here and would be invented surfaces.

L8 (verification round 3, 2026-10-18): the second pass accepted the id fix, the recorded deviations and the expanded coverage, but failed the hunk numbering on a boundary case the first fix left open (advancing past 2^53), and found the record overstating what the suite proves. The numbering was corrected in `6997c02` (RED observed before the fix) and the record in `db6f6e5`; a third pass re-checked both and then flagged only the record's commit attribution, corrected here.
