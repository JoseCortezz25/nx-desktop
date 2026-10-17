# Issue 43 — Responsive desktop layout

## Objective and authority

Implement [issue #43](https://github.com/JoseCortezz25/nx-desktop/issues/43) against merged shell `cc079940eac38a327fbc760a0572ef19dd57d980`. The maintainer [approved](https://github.com/JoseCortezz25/nx-desktop/issues/43#issuecomment-6242046193) small windows with a 900×700 native minimum: the right panel becomes an on-demand dismissible overlay before it squeezes the main pane; the sidebar collapses to the rail at narrower widths. Both must not occupy fixed side-by-side columns at the minimum. Preserve toggles, keyboard access, panel tab state, composer/send reachability, and adapt home, conversation, panel tabs, and dialogs. Verify multiple sizes and region combinations, including 900×700. The source issue's original 520/894px widths and 1440px send-clipping evidence are obsolete after #40/#42.

## Scope and constraints

Branch `feat/issue-43-responsive-layout` in isolated worktree `~/.fabrica/workspaces/nx-desktop/issue-43`. This is presentation and native-window configuration only; do not change provider/backend contracts or #31. Work with existing app architecture, English technical artifacts and repo rules; no credentials, no review binaries in the implementation branch. Use the unchanged conventional PR-title judge (the #46 exception was one-time). Test-first when an existing deterministic runner can assert breakpoints/visibility; otherwise record why browser/native functional and visual validation supplies the proof. Global checks already failing on base must be identified rather than called green.

## Implemented design (measured, not invented)

Region presentation is a pure rule in `src/shared/ui/layout/region-visibility.ts`, resolved from the window width by the shell (`src/app/app-shell.tsx`). Region **visibility** stays the ephemeral state the rail toggles own; only the **presentation** changes, so overlaying never negates a manual toggle.

- `LAYOUT_METRICS` records the measured floors: `mainPaneFloor: 366` (conversation pane content floor, the #40 sweep flipped clean at main = 366) and `composerDockFloor: 705` (composer max-content 657 + dock gutters 48, re-measured live at 632/657).
- `LAYOUT_BREAKPOINTS.rightPanelInlineMin = 1200` = rail 56 + sidebar 318 + panel 460 + main floor 366.
- `LAYOUT_BREAKPOINTS.sidebarInlineMin = 1079` = rail 56 + sidebar 318 + composer dock floor 705.
- `resolveRegionLayout(width)` returns `inline | overlay` per region: both inline ≥1200; panel overlays below 1200; sidebar also overlays below 1079. Monotonic — no flapping.
- Overlay drawers are `position: absolute` inside `.window-shell__body`, anchored right of the rail, and end above the composer via the composer-published `--composer-clearance`; the composer dock also paints above them (`--layer-composer`). Escape dismisses the focused drawer; focus moves in on open and is restored on close.
- `src-tauri/tauri.conf.json` now declares `minWidth: 900, minHeight: 700` and opens at `1200×800`; `--window-min-width: 900px` / new `--window-min-height: 700px` in `tokens.css` agree with it.
- No dialog/modal component exists anywhere in `src/` (grep: none); the inspected surfaces are home, conversation, composer, sidebar, right panel/tabs. No dialog was invented.

## Actionable checklist

- [x] **T1 — Layout policy and native minimum.** Native `minWidth`/`minHeight` plus matching CSS floor, measured breakpoints, panel overlay below 1200, sidebar collapse below 1079, Escape/focus/tab-state preserved. Deterministic policy + wiring tests (RED → GREEN). Commit `e9f5ffd`.
- [x] **T2 — All surfaces and multi-size proof.** Home, conversation, composer, sidebar, right panel/tabs adapted; multi-size and multi-state browser measurements below. Check-only format/typecheck/lint/test compared to a green base. Commit `e9f5ffd`.

## Verification observed (builder self-check — not QA)

Base `cc079940` was green before the change: 211 tests, typecheck/lint/format clean. After the change:

| Check                     | Result                           |
| ------------------------- | -------------------------------- |
| `pnpm test`               | 224 passed (38 files); +13 tests |
| `pnpm run typecheck`      | clean                            |
| `pnpm run lint`           | clean                            |
| `pnpm run format:check`   | clean                            |
| `pnpm run rust:fmt:check` | clean                            |
| `pnpm run rust:clippy`    | clean (`-D warnings`)            |

Browser measurement (Vite dev server, mock repositories, agent-browser; DOM rectangles, `scrollWidth`, computed `position`, `elementFromPoint`, focus):

| Size     | sidebar | panel   | main pane | composer      | send in viewport | `elementFromPoint` at send = send | doc overflow |
| -------- | ------- | ------- | --------- | ------------- | ---------------- | --------------------------------- | ------------ |
| 1440×900 | inline  | inline  | 606       | 557 (wrapped) | yes              | yes                               | none         |
| 1200×800 | inline  | inline  | 366       | 317 (wrapped) | yes              | yes                               | none         |
| 1150×800 | inline  | overlay | 776       | 705           | yes              | yes                               | none         |
| 1079×760 | inline  | overlay | 705       | 656           | yes              | yes                               | none         |
| 1000×720 | overlay | overlay | 944       | 705           | yes              | yes                               | none         |
| 900×700  | overlay | overlay | 844       | 705           | yes              | yes                               | none         |

Also measured: all four region states (none / sidebar only / panel only / both) at 900×700 with no document overflow and a reachable send; home and conversation views both; an open file tab survived close/reopen and an overlay↔column switch; Escape closed the focused drawer and restored focus to the rail toggle; a refined reachability sweep found no unreachable control in the composer, rail, sidebar drawer, or panel at any size (main-pane content behind an open overlay is covered by design and is reachable by dismissing it).

Known limitations (reported honestly): the native OS window frame cannot be exercised in this environment, so `minWidth`/`minHeight` are config-declared and schema/build-validated, not natively exercised; browser geometry is not native-frame proof. At the 900 minimum with both regions open the drawers cover most of the main pane by construction (rail 56 + sidebar 318 + panel 460 = 834 of 900); the composer stays clear and operable.

## Delivery and progress

Forecast was roughly 400–650 authored changed lines. Actual: one implementation commit `e9f5ffd` (18 files, ~626 inserted / ~88 deleted including the sidebar-test capture-pattern rewrite) plus this record. Single PR for the cohesive shell-plus-surface adaptation. Next step: independent Verifier, then independent visual+functional QA.
