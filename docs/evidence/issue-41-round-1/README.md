# Issue #41 — Round 1 QA visual evidence (scoped-visual)

Scope: **sidebar header only** (`.sidebar__header`) — brand and the former tool/chevron region.
Viewport: **1440x900 desktop**, sidebar open on Home; conversation view for regression.
Validation type: **`scoped-visual`** (binding) + functional header assertions.

This directory is QA evidence for issue #41 / PR #45. It is intentionally published on a
separate branch (`docs/evidence-issue-41-round-1`) and is **not** part of PR #45 or `main`.

## What was compared

| Role     | Commit                                     | Ref                                            |
| -------- | ------------------------------------------ | ---------------------------------------------- |
| Baseline | `05735c4379eb2b75d1b7a8bed68e66e1ecd10a09` | PR #45 base (`main`)                           |
| Current  | `69ce1b41cf2be04eaaa342f27709e6dc5027b1c6` | PR #45 HEAD (`feat/issue-41-sidebar-brand-nx`) |

Capture mode: **`clip`** — element screenshot of `.sidebar__header` (286x28 CSS px), plus full
viewport context. Engine: **HeadlessChrome/152.0.0.0** via **agent-browser 0.26.0** (Chromium over
CDP), deviceScaleFactor 1. Dynamic areas ignored: conversation/project rows and the composer.

## Files

| File                                                                                                  | What it is                                                              |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `base-05735c4-1440x900-header-clip.png`                                                               | Baseline scoped header (brand `OpenCode` + chevron + bell + magnifier). |
| `current-1440x900-header-clip.png`                                                                    | Current scoped header (`Nx` only).                                      |
| `base-05735c4-1440x900-viewport.png` / `current-1440x900-viewport.png`                                | Full 1440x900 viewport context, same states.                            |
| `current-69ce1b4-1440x900-conversation-viewport.png` / `current-69ce1b4-conversation-header-clip.png` | Conversation view (regression context).                                 |
| `current-69ce1b4-header-provider-{OpenCode,Codex,Claude}.png`                                         | Header with each provider selected.                                     |
| `diff-05735c4-vs-69ce1b4-header-clip.png`                                                             | Scoped diff (red = differing pixels on white).                          |
| `manifest.json`                                                                                       | Baseline/current manifest (scope, selector, viewport, engine, commits). |
| `visual-report.json`                                                                                  | Per-image ink profiles and pixel-diff metrics + controls.               |
| `dom-evidence.json`                                                                                   | Live DOM geometry, computed styles and a11y counts for both commits.    |
| `analyze-header-diff.mjs`, `qa-visual-report.mjs`                                                     | Repro scripts for the scoped comparison.                                |

## Method and kit gap #48

The kit's `evaluate-visual-diff.ts` has **no `--selector`** (it cannot clip) and **cannot click**,
so a scoped clip comparison cannot run through it. Per the documented scoped workaround, both sides
were captured as element clips and compared directly with `pngjs` (per-pixel Manhattan RGB
distance; `ink` = distance > 12 from the modal background; diff pixel = summed channel delta > 12).
`visual-report.json` records the method verbatim. The script was validated with a negative control
(an image against itself reports 0 differing pixels) and a positive case (the real base/current
comparison reports 933 differing pixels).

## Outcome

Current header renders the brand `Nx` and nothing else; the header box, height and brand position
are identical to the baseline, and the diff is confined to the brand text and the three removed
controls. See the `QA says:` comment on issue #41 / PR #45 for the verdict.
