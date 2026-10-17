# QA evidence - issue #42 (native window chrome), PR #46, round 1

Independent QA for issue [#42](https://github.com/JoseCortezz25/nx-desktop/issues/42) /
PR [#46](https://github.com/JoseCortezz25/nx-desktop/pull/46), branch
`feat/issue-42-native-window-chrome`, HEAD `4c2ba361c7943bf76edda4569017bca9fce773c0`,
base `f71ccaaa1a08dc7bf68f4e8c180b0e8c7141acde`.

**Verdict: PASS** - functional + scoped-visual (app content area only), desktop 1440x900.

These are review artifacts on a dedicated evidence branch, not application source and
not a pixel baseline. The baseline for the comparison is the wireframe HTML itself
(`docs/wireframes/01-home.html`, `02-home-sidebar.html`).

## Scope and method

- **Validation type:** `scoped-visual` (layout regions 2-5 only: rail, sidebar, main
  pane, right panel = `.window-shell__body`) **plus functional**.
- **Excluded:** region 1 (title bar) and all OS-drawn chrome (native frame, native
  application menu, OS window controls). Issue #42 states plainly that those cannot be
  pixel-compared, because the pixels belong to the window manager.
- **Method:** the issue #4 precedent (`docs/captures/issue-4/README.md`) - render the
  wireframe reference at 1440x900, capture the app at the same viewport, then compare
  structure and measured geometry, recording the intentional 40px shift.
- **Not a pixel-parity gate:** the reference draws wireframe content (placeholder
  provider names, drawn suggestion rows, ~12 decorative rail icons) the app
  intentionally does not reproduce. `evaluate-visual-diff.ts` is **unavailable** for
  this comparison (it has no clip/selector capture for the current page) and is
  reported as such, not passed.

## States compared

| # | State | Reference | Current capture | Comparison |
| - | ----- | --------- | --------------- | ---------- |
| 01 | default (both regions closed) | `reference-01-home-1440x900.png` (`01-home.html`) | `current-01-default-closed.png` | `comparison-01-default-1440x900.png` |
| 02 | sidebar open | `reference-02-home-sidebar-1440x900.png` (`02-home-sidebar.html`) | `current-02-sidebar-open.png` | `comparison-02-sidebar-1440x900.png` |
| 04 | right panel open | - (no wireframe draws this state) | `current-04-right-panel-open.png` | `comparison-04-right-panel-1440x900.png` |
| 03 | both open | - (no wireframe draws this state) | `current-03-sidebar-and-right-open.png` | `comparison-03-both-1440x900.png` |

The wireframes draw the right panel only inside the chat screens (`03`, `13`, `18`), so
states 03/04 are **current-state functional + geometry checks**, not invented reference
parity.

## Visual evidence block

- **Current capture:** `current-01..04-*.png`, viewport mode, 1440x900, route `/`,
  app at `4c2ba36`.
- **Baseline reference:** `docs/wireframes/01-home.html` and `02-home-sidebar.html`
  (shared `assets/wireframe.css`) at commit `4c2ba36`, rendered to
  `reference-01-home-1440x900.png` / `reference-02-home-sidebar-1440x900.png` at the
  same 1440x900 viewport. Manifest: `manifest.json`.
- **Comparison / annotation:** `comparison-*-1440x900.png` - reference and current side
  by side with measured region rectangles overlaid, the removed 40px band marked in
  orange, plus an image-derived boundary cross-check. Diff image in the usual pixel
  sense is **not applicable** here (structural comparison; see method).
- **Comparison metadata:** scope = regions 2-5; viewport = desktop 1440x900; capture
  mode = `viewport`; dynamic regions ignored = catalog-fed sidebar rows, composer
  chips, home placeholder/suggestions, rail avatar; verdict per viewport = pass.

## Measured geometry (the decisive evidence)

Full data in `measurements.json`; boundaries re-derived from raw pixels in
`image-derived-geometry.json`.

| Metric | Reference | Current | Delta | Reading |
| ------ | --------- | ------- | ----- | ------- |
| rail width | 56 | 56 | 0 | unchanged |
| sidebar width | 318 | 318 | 0 | matches `--sidebar-width` |
| main pane width (default) | 1384 | 1384 | 0 | unchanged |
| main pane width (sidebar open) | 1066 | 1066 | 0 | unchanged |
| rail top y | 40 | 0 | -40 | **intentional** (drawn title bar removed) |
| main pane top y (default) | 48 | 8 | -40 | intentional |
| main pane height (default) | 848 | 888 | +40 | region fills the removed band |
| sidebar top y | 48 | 8 | -40 | intentional |
| sidebar height | 852 | 892 | +40 | intentional |
| right panel width / x | - | 460 / 980 | - | `--right-panel-width`, pinned right |

Independent pixel pass: the first panel-white **row** is 49/48 in the reference and 9
in the current capture - a 40px delta that matches the DOM measurement exactly. The
rail | surface boundary is column 56/57 in both.

**Overflow:** `documentElement` is 1440x900 in all four states - no scrollbar and no
overflow. When both regions are open the widths sum exactly: 56 + 318 + 606 + 460 = 1440.

## Functional evidence

`functional-flow.txt` (transcript) and `dom-evidence.json` (machine data):

- `.title-bar`, `.menu-bar`, `.window-controls`, `.nav-history` are **absent (0 nodes)**
  in all four states.
- None of the nine removed strings (`Archivo`, `Edición`, `Ver`, `Ayuda`, `Atrás`,
  `Adelante`, `Minimizar`, `Maximizar`, `Cerrar`) appears in rendered text.
- The rail holds exactly three buttons: `Inicio` (home, `aria-current=page`) plus the
  two region toggles. Each toggle completes **CLOSED -> OPEN -> CLOSED** independently
  and its `aria-pressed` tracks the state; each toggle leaves the other region untouched.
- The home view still renders (`¿En qué deberíamos trabajar?`).
- Console: 0 errors, 0 warnings (only Vite connect + React DevTools info).
- Native chrome: verified by **source/config inspection** (`src-tauri/src/lib.rs`
  declares `Menu::default` and wires `Builder::menu`; `src-tauri/tauri.conf.json` has no
  `decorations` key, so the native frame default stays on) - **not** by a rendered
  comparison and **not** as OS runtime proof.

## Repo harness coverage (corroboration, not the verdict basis)

The flows validated here are already frozen in the repo's own Vitest harness, so no new
QA test artifact was created (the implementation PR is not mutated):

- `src/shared/ui/organisms/rail.test.tsx` - home is the current entry; both region
  toggles render, report their press and reflect their own region (`isPressed` true/false).
- `src/app/app-shell.test.tsx` - the shell markup contains no `title-bar`, `menu-bar`,
  `window-controls` or `nav-history`; the two region toggles live in the rail.
- `src/shared/i18n/messages.test.ts` - the removed `window.*` copy is gone.

`pnpm test` on a clean install at HEAD `4c2ba36`: **38 files / 211 tests passed, exit 0**
(`repo-tests.txt`).

## Limitations (declared, not defects)

- Native frame/menu **runtime** behaviour on Windows and macOS is unproven: this run is
  WSL2, headless Chromium, no native window manager.
- `evaluate-visual-diff.ts` is unavailable for this comparison (no clip capture of the
  current page); the structural method above is used instead.
- The home-view content differs from the wireframe by design (runtime provider data vs
  drawn placeholders), so no full-page pixel parity is claimed or expected.

## Capture integrity

`capture-integrity.json` cross-checks each screenshot against the DOM state measured at
the same moment using the non-white pixel fraction of each region band: the sidebar band
is 0.0000 in the default capture and 0.0404 in both sidebar-open captures; the
right-panel band is 0.0000 in the default capture and 0.0044 in both right-open captures.
No screenshot is paired with the wrong state.

## Reproduce

See `commands.txt`. Regenerate the comparisons with `node build-comparison.mjs`, then
serve this directory over HTTP and open `comparison-<state>.html`.
