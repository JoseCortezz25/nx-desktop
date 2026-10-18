# Issue 15 — Hooks review modal

## Objective and authority

Implement [issue #15](https://github.com/JoseCortezz25/nx-desktop/issues/15) against base `822d1cf` (`main`, issue #13 merged; 48 test files / 307 tests, `format:check`, `lint`, `typecheck` clean).

Branch `feat/issue-15-hooks-review-modal` in isolated worktree `~/.fabrica/workspaces/nx-desktop/issue-15`.

The maintainer set the scope: **the wireframe 14/15 surface with its composer trigger, without persisting the decision**. Persisting a `HookDecision` into the project mock stays out (it belongs to the run tickets #19/#23). The issue's open question — "behavior of a hook that was not allowed" — is **already answered** by the locked decision of 2026-10-16 (`business-logic.md` §2 `Hook`): a declined hook is remembered at project scope, not per run and not globally. This delivery therefore only _emits_ the decision; it does not own its persistence, and it invents no policy of its own.

## Specs

S1. Issue #15, "What to build": "Modal listing hooks with checkbox, name, `Nuevo` badge and expandable details (origin, hook type, command, timeout)."

S2. Acceptance criterion: "Rows expand/collapse".

S3. Acceptance criterion: "Selection state is controlled via props".

S4. Acceptance criterion: "Components classified into `atoms/`, `molecules/`, `organisms/` with correct import direction".

S5. Acceptance criterion: "All UI copy lives in `messages.ts`; no wireframe placeholder text hardcoded (`ChatGPT`, `GPT-6.1 Sol`, ...)." The wireframe's `Hook 1` … `Hook 6` are placeholders: the mock ships real hook names as data.

S6. Acceptance criterion: "Data comes from typed interfaces backed by mock data (no IPC yet)."

S7. Acceptance criterion: "`pnpm typecheck`, `pnpm lint` and `pnpm format:check` pass".

S8. Maintainer scope decision (this delivery): wireframe 14/15 complete — the modal **and** the composer's hooks control that opens it (the amber dot marks pending new hooks) — but the footer decision is only emitted upward; no `HookDecision` is written into the project mock and no run is started.

S9. Locked decision (`business-logic.md` §2 `Hook`, decision 2026-10-16): "The decision about a hook is **project-scoped**: a hook the user declines (`Ahora no`) is remembered per `Project` through `HookDecision`, not per run and not globally." The modal's three footer actions map to that vocabulary: `Ahora no` → `rejected`, `Permitir todo` → `approved` for every listed hook, `Permitir la selección` → `approved` for the selected ones and offered only when the selection is non-empty. Nobody is re-prompted for a decision already remembered, so the modal never invents a fourth status.

S10. Existing contracts that must keep working: the composer's approval/provider/model/effort controls and its popovers; the shared `Dialog` molecule's focus trap, Escape and backdrop dismissal; the create-project dialog that also uses `Dialog` (#9); the shell's regions, panel and conversation behaviour.

## Tasks

- [x] T1 — `src/features/hooks` data and model: `HookRepository` port, mock repository with six hooks, loading hook, and the pure rules (new-hook count, selection toggle and select-all, timeout formatting). Tests for the rules. S3, S5, S6, S9. Commit `630dbd1`.
- [x] T2 — the modal: `Checkbox` atom, `hook-row` and `hook-detail` molecules, `HookReviewDialog` organism on the shared `Dialog`, feature copy in `src/features/hooks/messages.ts`. Tests. S1, S2, S4, S5, S9. Commit `fff786c`.
- [x] T3 — reachability: the composer's hooks control with the new-hooks indicator, shell state for the open dialog and the selection, and the wiring that emits the decision and closes. Tests, including the S10 regressions. S3, S8, S10. Commit `209431c`.

## Log

L1 (maintainer, verbatim): "amigo ahora vamos con la issue 15"

L2 (maintainer decision, this session): scope = "B — Wireframe completo, sin persistir" — the modal and the composer trigger, with the footer decision emitted upward only.

## Verification observed (builder self-check — not QA)

Base `822d1cf` was green before the first edit: 48 test files / 307 tests, `format:check`, `lint`, `typecheck` clean. After the change:

| Check                   | Result                                             |
| ----------------------- | -------------------------------------------------- |
| `pnpm test`             | 340 passed (55 files); +33 tests over the base     |
| `pnpm run typecheck`    | clean                                              |
| `pnpm run lint`         | clean                                              |
| `pnpm run format:check` | clean                                              |
| `git diff --check`      | clean (no trailing whitespace or conflict markers) |

Rules the suite observes (node-only style: `renderToStaticMarkup` plus pure-model tests):

- S3 — the dialog never owns the selection: `hook-review-dialog.test.tsx` renders it from a controlled set, asserts the boxes follow it, and that every footer action only reports (`onDecide`) instead of mutating it; `app-shell-hooks-seam.test.tsx` proves the shell owns the set and resets it on reopen.
- S2 — `hook-id` toggling is pure and immutable, and the dialog expands only the disclosed row (asserted through the captured row props and the rendered detail).
- S1/S9 — the three footer actions map to the locked vocabulary with the range they cover (`rejected`/`all`, `approved`/`all`, `approved`/`selection`), and `Permitir la selección` is disabled while the selection is empty.
- S5 — every string comes from `getHookMessages()` or the shared composer copy; the wireframe's `Hook 1`…`Hook 6` placeholders are not used, the mock ships real names as data.
- S8/S10 — the composer trigger appears only when the shell hands it a handler, its accessible name carries the new-hook count, and the amber dot appears only above zero; the existing approval/provider/model/effort expectations and the create-project dialog keep passing untouched.

Browser check of the real surface (Vite dev server on the mock repositories, agent-browser): the composer draws `Revisar hooks: 4 nuevos` with the amber dot; the control opens the modal on six rows with checkbox, name and `Nuevo` badge; expanding one row reveals Origen, Tipo de hook, Comando (monospace) and Tiempo límite; the footer reads the note plus `Ahora no`, `Permitir todo` and a disabled `Permitir la selección`; no horizontal overflow and no clipped control. The two states were compared against `docs/wireframes/14-hooks-review.html` and `15-hooks-review-expanded.html`.

That browser pass found a real defect the suite could not: the shared `Dialog` is 572px (create-project), so the review footer's third action was clipped, and `variant="solid"` — the round send button — was wrapping a sentence into a 30px circle. Fixed in `b790de1`: an optional `size="wide"` on `Dialog` (748px, the width screens 14/15 draw), a filled `primary` text variant on `Button`, and footer rules that never squeeze a label. Not fixed here, reported instead: `create-project-dialog` uses `variant="solid"` for its own primary text action and shows the same squeeze on `main` — a pre-existing #9 defect outside this ticket.

Not verified by this round: the formal independent visual/functional QA pass on its own evidence branch (the issue's stated validation type), and native OS interaction.

## Delivery and progress

Four work-unit commits on `feat/issue-15-hooks-review-modal`, 34 files, ~1366 authored changed lines:

| Commit    | Slice                                                      |
| --------- | ---------------------------------------------------------- |
| `630dbd1` | hooks data seam and review rules                           |
| `fff786c` | controlled review dialog (atom, molecules, organism, copy) |
| `209431c` | composer trigger and shell wiring, without persistence     |
| `b790de1` | wide dialog surface and a legible primary action           |

Total is past the ~400-line advisory slice, so the delivery shape is a decision for the maintainer (one PR versus two chained ones: the hooks feature and its dialog, then the composer and shell wiring). Push, PR creation and merge remain the maintainer's decisions.

## Log

L3 (browser round, 2026-10-18): the rendered modal exposed a clipped primary action and a sentence wrapped in the round `solid` button. Both fixed with an optional wide dialog size and a `primary` text variant; the pre-existing `create-project-dialog` squeeze is reported, not silently fixed.
