# QA evidence — issue #43 (responsive window shell), PR #50, round 1

Independent product QA for issue [#43](https://github.com/JoseCortezz25/nx-desktop/issues/43) /
PR [#50](https://github.com/JoseCortezz25/nx-desktop/pull/50), branch `feat/issue-43-responsive-layout`,
HEAD `6f50b7db52d028dd28c3f2b1853359c4cb958e4e`, base `cc079940eac38a327fbc760a0572ef19dd57d980`.

**Verdict: PASS** — `visual+functional` (binding type), at **900x700, 1000x720, 1200x800, 1440x900**,
home and conversation, every region open/closed combination.

These are review artifacts on a dedicated evidence branch. They are not application source and not a
pixel baseline. The below-1440 baseline is the maintainer-approved structure, not an independent oracle.

## Scope and method

- **Validation type:** `visual+functional` (binding, per the Round 2 coder handoff).
- **Scope:** the window shell — rail, sidebar, main pane, right panel/tabs, composer dock. The app has no
  dialog/modal component (`grep` over `src/`: none), so none was tested or invented.
- **Method:** drive the app from the PR branch on the documented `pnpm run dev` server
  (`http://localhost:1420`, mock repositories, no auth) with `agent-browser` over CDP; read the live DOM
  (`getBoundingClientRect`, `elementFromPoint`, `getComputedStyle`, `aria-pressed`, `document.activeElement`)
  and capture viewport screenshots at the same viewport; then overlay the **measured rectangles** on the raw
  captures (`build-comparison.mjs`).
- **Capture mode:** `viewport`. **Dynamic areas ignored:** message timestamps (`Enviado a las HH:MM`).
- **Reference at 1440x900:** the rendered wireframes `docs/wireframes/01-home.html` /
  `02-home-sidebar.html` (the only size a wireframe draws), compared structurally + geometrically.
- **Reference below 1440x900:** the maintainer decision in
  [comment 6242046193](https://github.com/JoseCortezz25/nx-desktop/issues/43#issuecomment-6242046193) —
  rail 56 + sidebar 318 + right panel 460; panel overlays first, sidebar collapses second. **This ticket
  establishes these baselines; it is not an independent pixel-parity oracle** (issue #43 says so).
- **Diff tooling:** `evaluate-visual-diff.ts` is **unavailable** for this comparison — it cannot drive a UI
  state and cannot clip the current side (recorded in issue #43 as a kit defect). Reported as unavailable,
  not passed; the comparison is structural + geometric with measured DOM rectangles over the raw captures.

## States compared

| # | Viewport | State | Current capture | Reference |
| - | -------- | ----- | --------------- | --------- |
| 01 | 900x700 | home, all four region combos | `current-900x700-home-s0p0/s1p0/s0p1/s1p1.png` | approved structure |
| 02 | 1000x720 | home, all four region combos | `current-1000x720-home-*.png` | approved structure |
| 03 | 1200x800 | home, all four region combos | `current-1200x800-home-*.png` | approved structure |
| 04 | 1440x900 | home, all four region combos | `current-1440x900-home-*.png` | wireframe 01/02 + approved structure |
| 05 | all four | conversation, s0p0 and s1p1 | `current-<W>x<H>-conv-s0p0/s1p1.png` | approved structure |
| 06 | 900x700 | file opened from a chat (panel overlay + tab) | `current-900x700-conv-s1p1.png` | — |

## Visual evidence block

- **Current capture:** `current-<W>x<H>-home-<state>.png` and `current-<W>x<H>-conv-<state>.png`,
  viewport mode, 900/1000/1200/1440, route `/`, app at `6f50b7d`.
- **Baseline reference:** `reference-01-home-1440x900.png`, `reference-02-home-sidebar-1440x900.png`
  (rendered from `docs/wireframes/01-home.html`, `02-home-sidebar.html` at commit `6f50b7d`); below 1440 the
  approved structure above. Manifest: `manifest.json` (commit/branch of this evidence branch in the PR).
- **Comparison:** `comparison-1440x900.png` (reference vs current, region rectangles overlaid),
  `key-evidence-viewports.png` (every viewport, every region open, rectangles overlaid),
  `annotated-viewports.html/.png` (all four region states at all four sizes). A pixel-diff image is
  **not applicable** (structural comparison; see method).
- **Comparison metadata:** scope = window shell; viewports = 900x700, 1000x720, 1200x800, 1440x900;
  capture mode = `viewport`; dynamic ignored = message timestamps; verdict per viewport = **pass**.
- **Measured rectangles (decisive evidence):** `measurements/summary.json` and `measurements/summary.md`;
  full raw probe output in `measurements/*.json`.

### Key measured result (all 32 home+conversation states)

| Viewport | sidebar | right panel | composer dock | send | doc overflow (x,y) |
| -------- | ------- | ----------- | ------------- | ---- | ------------------ |
| 900x700 | overlay `absolute` 56–374 | overlay `absolute` 440–900 | 126–831 y520 | visible, hit=self | 0,0 |
| 1000x720 | overlay `absolute` 56–374 | overlay `absolute` 540–1000 | 176–881 y540 | visible, hit=self | 0,0 |
| 1200x800 | column `static` 56–374 | column `static` 740–1200 | 375–740 y440 (h 222, wraps) | visible, hit=self | 0,0 |
| 1440x900 | column `static` 56–374 | column `static` 980–1440 | 375–980 y404 (h 183) | visible, hit=self | 0,0 |

- Breakpoint order matches the pure rule: `>=1200` both inline; `1079–1199` sidebar inline + panel overlay;
  `<1079` both overlay. The right panel gives way first, the sidebar second (approved order).
- The overlay drawers never overlap each other (900: sidebar ends x=374, panel starts x=440) and always end
  above the composer dock (8px `--region-gutter`); the composer dock (`z-index 30`) paints above them
  (`z-index 20`).
- `--composer-clearance` tracks real height changes: dock height 151→222px when the panel opens at 1200x800
  (action row wraps) moves clearance 396→360px; the drawers follow.
- **No document overflow** and **send reachable (hit=self)** in every state at every viewport.

## Functional evidence

Full transcript: `functional-flow.txt`; machine data: `measurements/*.json`; `dom/` has the probe and sweep
scripts. Summary:

- Both rail toggles activate by mouse **and** keyboard (`Enter`/`Space`); `aria-pressed` is truthful and
  each toggle leaves the other region untouched.
- **Escape** dismisses the focused overlay in both regions; the right panel restores focus to the element
  that opened it. **The sidebar does not** — see the finding below.
- A file chip opens the right panel as an overlay with its tab; two tabs survive close/reopen and an
  overlay→column switch (no state discarded).
- `Nuevo chat` returns home and leaves the sidebar open; rail `Inicio` returns home.
- Resizing at runtime flips presentation (inline↔overlay) without negating a manual toggle: both regions
  stay open (`aria-pressed=true`) across 1200→900→1440.
- Control-reachability pass (scrollIntoView + `elementFromPoint` over rail/composer/sidebar/panel controls):
  **0 unreachable** at 900x700 and 1000x720 in every region combination, home and conversation.
- Repo checks at HEAD: `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check` clean; `pnpm test`
  224 passed (38 files).

## Finding — sidebar drawer does not restore focus on Escape close (confirmed, adjudicated)

The Verifier flagged this; I reproduced it deterministically (see `functional-flow.txt` C) rather than
inheriting the label:

1. At 900x700, open the sidebar from the rail toggle as an overlay (`document.activeElement` =
   `.sidebar--overlay` after the drawer's focus-in effect).
2. Press Escape → the drawer unmounts and `document.activeElement` becomes `document.body`, **not** the rail
   toggle. The right panel, which stays mounted, restores focus correctly.

Root cause: `src/shared/ui/organisms/sidebar.tsx:92-96` restores focus only when
`drawer?.contains(document.activeElement)` in the effect cleanup, but the drawer is unmounted before the
passive cleanup runs and the browser has already moved focus to `body`, so the guard never passes. The code
comment (sidebar.tsx:76-79) and the Round 1 handoff claim ("Escape closed the focused drawer and restored
focus to the rail toggle") are therefore inaccurate for the sidebar.

**Adjudication: acceptable residual, not a failed acceptance criterion.**
- Issue #43's required criteria are: layouts verified at ≥4 sizes with every region open; **no control
  clipped, overlapped or unreachable**, send visible and operable; the native minimum declared and matching
  the token; every page adapts; the range/collapse order recorded; the repo checks pass. None of these
  mentions focus restoration.
- The maintainer's approved decision requires the toggles to stay **operable** and manual toggles not to be
  negated; both hold — the rail toggle works by mouse and keyboard and `aria-pressed` is truthful.
- Impact is low and not a keyboard trap: focus lands on `document.body`, from which one `Tab` reaches the
  rail. No control becomes unreachable and the send control is unaffected.
- It is nonetheless a real, reproducible defect in a code path this PR introduces (a dead focus-restore
  guard whose stated purpose is exactly this), so it is reported, not hidden.

**Named follow-up owner:** filed as the next shell/a11y follow-up — the `sidebar.tsx` focus-restore guard
on the overlay-close path. Routing owner: the Fabrica **orchestrator** (create/route the follow-up ticket),
implemented by **Builder/Recovery** on a separate branch; QA must not fix code on this PR. This is **not**
counted as an implementation failure (0/2 → the change meets every hard criterion and the approved decision).

## Native minimum (config, not native runtime)

`src-tauri/tauri.conf.json` declares `width 1200 / height 800 / minWidth 900 / minHeight 700`;
`src/shared/ui/tokens.css` declares `--window-min-width: 900px` and `--window-min-height: 700px` (identical).
`.window-shell` computes `min-width: 900px` (observed live). This is **source/config inspection only** — the
native OS frame was not exercised in this environment (WSL2, headless Chromium, no window manager), so it is
not proof that the OS refuses to shrink the decorated frame below 900x700. No fabricated native proof.

## Limitations (declared, not defects)

- Native OS frame / OS-enforced minimum not exercised; browser geometry is not native-frame proof.
- Remote CI unavailable (account-level `startup_failure`); all evidence is local.
- `evaluate-visual-diff.ts` unavailable (no UI-state driving / no current-side clip); comparison is
  structural + geometric.
- No DOM test environment (jsdom/happy-dom) is installed; focus behavior was measured in a real browser.
- Below 1440x900 has no pre-existing baseline; the new baseline is the approved structure and is not an
  independent pixel-parity oracle.

## Repo harness (corroboration)

The flows are already frozen in the repo's Vitest harness; no new QA test artifact was created and the PR
branch was not modified: `region-visibility.test.ts` (breakpoints), `app-shell-navigation-seam.test.tsx` /
`app-shell-panel-seam.test.tsx` (wiring), `sidebar.test.tsx` (overlay capture pattern), `file-panel.test.tsx`.
