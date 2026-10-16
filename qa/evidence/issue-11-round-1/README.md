# Visual evidence — issue #11 (conversation view), QA round 2

Validation type: **scoped-visual** (binding). Scope: **the conversation region in both
sidebar states**. Viewport: **desktop 1440x900**. App: `pnpm run dev` (Vite 8) at
`http://localhost:1420/` from PR #38 branch `feat/issue-11-conversation-view` @ `84ca824`.

## Captures (current app) — each states the accessible name asserted

| File                                     | Shows                                                         | Accessible name asserted                                                          |
| ---------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `current-01-open-region.png`             | conversation region, sidebar open (clip `.conversation-view`) | region `aria-label="Composer selection chain"`                                    |
| `current-02-open-viewport.png`           | full 1440x900, sidebar open                                   | region name + sidebar group labels `Fijados`/`Proyectos`/`Recientes`              |
| `current-03-open-chip1-active.png`       | chip 1 clicked → active marking                               | chip `aria-label="Abrir src/shared/domain/selection-chain.ts"`                    |
| `current-04-open-group-collapsed.png`    | first tool group collapsed                                    | header `aria-label="Expandir actividad de herramientas"`, `aria-expanded="false"` |
| `current-05-closed-region.png`           | conversation region, sidebar closed                           | region `aria-label="Composer selection chain"`                                    |
| `current-06-closed-viewport.png`         | full 1440x900, sidebar closed                                 | region name present, `.sidebar` absent                                            |
| `current-07-closed-longcontent.png`      | long-content probe (DOM-only)                                 | region name + long title/path/token                                               |
| `draft-01-home-with-draft.png`           | home, draft typed in composer                                 | textarea `aria-label="Mensaje"` = `QA-DRAFT-MARKER-do-not-lose-me`                |
| `draft-02-conversation-after-switch.png` | same after opening a conversation                             | composer textarea empty; provider chip `Proveedor: Codex` retained                |

## Baselines (wireframe source of truth, generated with `create-visual-baseline.ts`)

- `baseline-open-desktop.png` + `baseline-open-manifest.json` — `11-chat-conversation-sidebar.html`, viewport 1440x900.
- `baseline-closed-desktop.png` + `baseline-closed-manifest.json` — `12-chat-conversation-full.html`, viewport 1440x900.

## Diffs

- `diff-sidebar-open.png` (7.46% differing pixels), `diff-sidebar-closed.png` (5.77%).
- `eval-report.json` — pixelmatch, threshold 0.1, includeAA, 1440x900 both sides (no dimension mismatch).

## Machine log & scripts

- `observations.json` — every asserted state (DOM counts, layout rects, the observed
  open-file payload read from the running shell, collapse round trip, affordances,
  composer-draft behaviour, long-content probe).
- `capture-current.mjs`, `diff.mjs`, `probe2.mjs`, `probe3.mjs` — the harnesses used.

No file under review was modified: `git status --porcelain` on `84ca824` is empty.
