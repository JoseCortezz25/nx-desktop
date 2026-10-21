# Issue 51 — Restore keyboard focus after closing the responsive sidebar overlay

## Objective and authority

Fix [issue #51](https://github.com/JoseCortezz25/nx-desktop/issues/51): below the 1079px sidebar-collapse threshold (#43 / PR #50), closing the overlay sidebar drawer with Escape left `document.activeElement` on `document.body` instead of returning focus to the rail toggle that opened it. The right-panel overlay already restored focus correctly. Preserve the approved breakpoints, manual toggle state, composer clearance, and right-panel behavior.

## Scope and constraints

Branch `fix/issue-51-sidebar-focus-restore`. Presentation-only change to `src/shared/ui/organisms/sidebar.tsx` plus a pure helper; no shell, layout policy, CSS, or backend change. English technical artifacts, existing test conventions (Vitest in `node`, no DOM).

## Root cause (confirmed)

The sidebar drawer is unmounted when the region closes (unlike the right panel, which stays mounted and toggles `hidden`). Its passive `useEffect` cleanup ran after React had removed the drawer node; by then the browser had already moved focus off the removed, focused drawer to `body`, so the guard `drawer?.contains(document.activeElement)` was always false and focus was never restored. Reproduced in the browser on base: Escape → `BODY`.

## Implemented design

- `src/shared/ui/organisms/sidebar-focus.ts` — pure `resolveSidebarFocusRestore(restoreTarget, drawer, activeElement)`: returns the opener only when focus is still inside the drawer, the opener is still connected, and the opener is not itself inside the drawer; otherwise `null` (never steals focus the user moved elsewhere).
- `sidebar.tsx` — records the opener in a ref when the overlay opens; the Escape handler asks the helper and restores **before** calling `onClose` (so the decision is taken while the drawer is mounted). The open/close synchronization is now a `useLayoutEffect`, whose cleanup runs before React removes the drawer node, covering closes that bypass Escape (rail toggle activation that does not move focus, as in WebKit; a widening window). The ref is cleared after use so the two paths never restore twice.

## Actionable checklist

- [x] **T1 — Regression coverage.** `sidebar-focus.test.ts` (6 tests): restore when focus is inside, the #51 post-unmount `body` case returns no target, no focus stealing, detached opener, opener inside the drawer, missing opener/drawer.
- [x] **T2 — Fix.** Escape path and pre-removal cleanup restore focus to the rail toggle.
- [x] **T3 — Browser proof** at 900×700.

## Verification observed (builder self-check — not QA)

| Check                | Result                                           |
| -------------------- | ------------------------------------------------ |
| `pnpm test`          | 568 passed (92 files); +6 tests                  |
| `pnpm run check`     | clean (format, lint, typecheck, rustfmt, clippy) |
| `pnpm run rust:test` | green                                            |

Browser (Vite dev server with mock repositories, agent-browser, 900×700, keyboard-driven):

| Scenario                                                                    | Base    | Fix                      |
| --------------------------------------------------------------------------- | ------- | ------------------------ |
| Enter on rail toggle → focus inside drawer                                  | `ASIDE` | `ASIDE`                  |
| Tab to `Nuevo chat`, Escape                                                 | `BODY`  | `Alternar barra lateral` |
| Focus inside drawer, rail toggle activated without moving focus (`click()`) | —       | `Alternar barra lateral` |

Known limitation: the native WebKit webview was not exercised; the non-focusing toggle activation was simulated with a programmatic `click()`.
