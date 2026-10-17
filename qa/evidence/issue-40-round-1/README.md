# Visual + functional evidence — issue #40 / PR #44, QA round 1

- **Task:** https://github.com/JoseCortezz25/nx-desktop/issues/40
- **PR / branch:** https://github.com/JoseCortezz25/nx-desktop/pull/44 / `feat/issue-40-navigation-and-layout-seams`
- **Reviewed commit (detached HEAD):** `f6f30a4872a45b6836d938aa195d0e5427d5e2d4`
- **Validation type (binding, as declared):** `visual+functional`
- **Viewport:** desktop **1440x900** (both the layout criterion and the compositions)
- **Result:** **PASS** — functional flows all pass; the rendered structure matches the designated baseline within the ticket's stated allowance for a low-fidelity grayscale wireframe.

## Environment and method

| Item            | Value                                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| App             | `pnpm install --frozen-lockfile` then the README-documented `pnpm run dev` (Vite 8.3.4)                                                                                              |
| URL             | `http://localhost:1420/` — the port comes from `vite.config.ts` (`server.port: 1420`, `strictPort`) and was confirmed by the dev-server banner; it was not guessed                   |
| Browser         | headless chromium **152.0.0.0** driven by **agent-browser 0.26.0** (CDP) for flows, captures and interactive diffs                                                                   |
| Second browser  | playwright's chromium (**1248**) for the kit's `scripts/evaluate-visual-diff.ts` on the no-interaction state                                                                         |
| Auth / fixtures | none; the pinned conversation **“Composer selection chain”** with its three file chips. Dynamic areas ignored: the provider/model catalog values and the mock file document contents |
| Git             | clean detached worktree at `f6f30a4` before and after; no file under review was modified                                                                                             |
| Console         | no page errors and no console messages on the exercised flows                                                                                                                        |

Functional run: `agent-browser` refs + CSS selectors, every assertion read back with `eval` (DOM/geometry/attribute values). Full transcript: `functional-flow-transcript.txt`.

## Baselines (source of truth) — 1440x900

| Baseline              | Path @ commit                                                                                                                                           | Scope                                   | Notes                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------- |
| Wireframe 01 render   | `docs/captures/issue-4/ref-01-home.png` @ `3e697fd59e5c1131206765342f7ac35e50c2df94` (render of `docs/wireframes/01-home.html` @ `16f415a`)             | Home, no sidebar                        | low-fidelity structural reference                                            |
| Wireframe 03 render   | `baseline-wireframe-03-doc-panel-desktop.png` (render of `docs/wireframes/03-chat-sitemap-doc.html` @ `16f415a`) + `.manifest.json`                     | conversation + sidebar + document panel | the closest “every region open” reference                                    |
| Wireframe 11 render   | `baseline-wireframe-11-conversation-sidebar-desktop.png` (render of `docs/wireframes/11-chat-conversation-sidebar.html` @ `16f415a`) + `.manifest.json` | conversation + sidebar                  | region-geometry reference                                                    |
| Issue #4 app baseline | `docs/captures/issue-4/{01-default-closed,02-sidebar-open,03-sidebar-and-right-panel-open}.png` @ `3e697fd`                                             | shell frames                            | the app’s own rendered shell at the same viewport, before #10/#11/#12 landed |

`docs/wireframes/README.md` is the authority for the region inventory (“Title bar / Rail / Sidebar (toggleable) / Main pane / Right panel (toggleable, opens on file or diff click)”). The wireframes “show **layout and behavior**, not final visuals or copy”, so they are a **structural** reference; per the ticket, raw pixel equality is not the gate for changed layout.

## Captures (current app, 1440x900)

| File                                           | Shows                                                                  |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| `current-01-home-regions-closed.png`           | Home, both toggleable regions closed                                   |
| `current-02-home-sidebar-open.png`             | Home, sidebar open, right panel closed                                 |
| `current-03-home-all-regions-open.png`         | **Home, every region open** (rail + sidebar + main pane + right panel) |
| `current-04-conversation-sidebar-open.png`     | Conversation + sidebar, right panel closed                             |
| `current-05-conversation-all-regions-open.png` | **Conversation, every region open**                                    |
| `current-06-conversation-panel-closed.png`     | Conversation + sidebar, right panel closed (secondary check)           |
| `current-07-chip-revealed-panel.png`           | chip click revealed the panel with the file                            |
| `current-08-two-tabs-open.png`                 | two open tabs                                                          |
| `current-09-panel-reopened-tabs-kept.png`      | panel reopened, both tabs still there                                  |
| `current-10-home-draft-persisted.png`          | draft typed on Home after a Home→Conversation→Home round trip          |
| `current-11-home-closed-kitscript.png`         | Home-closed frame captured by the kit’s own script                     |

## Diffs and measured geometry

- `diff-01..04` — interactive-state diffs produced by `agent-browser diff screenshot --baseline`.
- `diff-05`, `diff-06` — diffs produced by the kit’s `scripts/evaluate-visual-diff.ts` (sha256 `03b23ffc…`, run unmodified from a directory whose `node_modules` resolves its imports).
- `diff-summary.json` — every comparison with pixels, ratio and whether the difference is inside the intended change.
- `region-diff-01/02-*.json` — region-localised diff counts (rail / title bar / sidebar / main pane / panel column).
- `geometry.json` — measured region rectangles per state, the wireframe reference geometry, and the token contract.
- `observations.json` — every asserted functional state and negative/critical path.

### Headline numbers

| Comparison (1440x900)                                                     | Differing pixels | Ratio      | Judgement                                          |
| ------------------------------------------------------------------------- | ---------------- | ---------- | -------------------------------------------------- |
| Home closed: current vs issue-#4 app baseline (`evaluate-visual-diff.ts`) | 10 073           | **0.78 %** | no unintended shift                                |
| Home closed: current vs wireframe-01 render (`evaluate-visual-diff.ts`)   | 21 460           | 1.66 %     | structural                                         |
| Home + sidebar open: current vs issue-#4 `02-sidebar-open`                | 15 971           | 1.23 %     | content only (rail diff **0 px**, title bar 67 px) |
| Home all regions open: current vs issue-#4 `03-…`                         | 30 522           | 2.36 %     | intended (panel 520→460)                           |
| Conversation + sidebar: current vs wireframe-11 render                    | 105 027          | 8.10 %     | low-fidelity reference                             |
| Conversation all regions open: current vs wireframe-03 render             | 135 349          | 10.44 %    | low-fidelity reference + flexible panel width      |

Measured, in the running app: **title bar 40px, rail 56px, sidebar 318px** in every state (equal to the tokens and to the wireframes; wireframe 11 reads 316px, a 2px difference). Right panel **460px** when open (the `--right-panel-width` token, the app-added value #40 explicitly made the first thing to reconsider; the wireframes leave that region flexible). Main pane **606px** with every region open, with `overflowX: hidden` and `scrollWidth == clientWidth` on both the pane and the composer bar, and the `Enviar` control at x 916–946 fully inside the pane.

## Verdict per viewport

- **desktop 1440x900 — PASS.** All five regions compose simultaneously; the composer’s action row wraps instead of clipping (`composer-bar` height 70px, no overflow); the send control is visible, hit-testable and operable; the chip reveals the panel; two tabs survive a close/reopen. The only geometry that moved is the right-panel width, which the wireframe declares flexible and #40 declares the intended change.

## Limitations (truthful)

- The QA model is **text only** and did **not** visually inspect the image pixels. Every visual claim here is derived from (a) DOM geometry read back from the running app, (b) `getComputedStyle` overflow/hidden values and an `elementFromPoint` hit test, and (c) computed pixel diffs. The published PNGs are for human/parent visual judgement.
- The kit’s `evaluate-visual-diff.ts` can only capture a URL it navigates to; it cannot click, so it cannot reach the sidebar-open or all-regions-open states (**kit gap #48**). Those states were compared with `agent-browser diff screenshot --baseline`, which does support the interactive state and scoping; this is a documented workaround, and the claim is limited to what each tool actually did.
- The issue-#4 app baselines predate #10/#11/#12, so their sidebar/main-pane **content** differs from today’s; they are used only as shell-frame references, and the region-localised diffs are reported to keep that distinction explicit.
- The `agent-browser` sessions ran headless chromium 152; the kit script ran playwright’s chromium 1248. Both rendered the same 1440x900 CSS viewport; identical tokens (fonts/colours) produced the same token geometry, and the two engines are not mixed inside a single comparison.

## Reproduce

```bash
pnpm install --frozen-lockfile
pnpm run dev                     # http://localhost:1420/
# functional flows + captures + interactive diffs
bash qa/evidence/issue-40-round-1/flow.sh
bash qa/evidence/issue-40-round-1/visual.sh
# kit script comparisons (needs playwright + pixelmatch + pngjs resolvable)
node evaluate-visual-diff.ts --url=http://localhost:1420/ --baseline=<dir> --out=<dir> --viewports=desktop --ready-selector=.home-view
# region-localised diff counts
node qa/evidence/issue-40-round-1/regiondiff.mjs <base.png> <cur.png> '<regions-json>'
```

`flow.sh`, `visual.sh`, `diffbands.mjs` and `regiondiff.mjs` are the harnesses used and are included verbatim.
