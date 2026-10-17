# Evidence — issue #42, Builder Round 1 (`feat/issue-42-native-window-chrome`)

Text transcript only. No images (the ticket's native chrome is OS-drawn and cannot be
pixel-diffed; a webview capture is not evidence about the native frame). This branch is
evidence-only and is never merged; the implementation lives on
`feat/issue-42-native-window-chrome`.

Base: `origin/main` = `f71ccaaa1a08dc7bf68f4e8c180b0e8c7141acde`
Implementation commits: `24557e8` (feat), `7113b33` (docs).

## Environment

- node `v24.15.0`, pnpm `10.33.2`
- cargo `1.99.0`, rustc `1.99.0` (host `x86_64-unknown-linux-gnu`)
- agent-browser `0.26.0` (headless chromium), viewport 1280x577
- GitHub Actions unavailable at account level (`startup_failure`); these are **local** runs, not remote CI.

## Command results (HEAD `7113b33`)

| Command                                                                          | Copy                      | Exit | Log                                     |
| -------------------------------------------------------------------------------- | ------------------------- | ---- | --------------------------------------- |
| `pnpm install --frozen-lockfile`                                                 | `pnpm`                    | 0    | `install.txt`                           |
| `pnpm test`                                                                      | `pnpm`                    | 0    | `final-test.txt` (38 files, 211 passed) |
| `pnpm run typecheck`                                                             | `pnpm`                    | 0    | `final-typecheck.txt`                   |
| `pnpm run lint`                                                                  | `pnpm`                    | 0    | `final-lint.txt`                        |
| `pnpm run format:check`                                                          | `pnpm`                    | 0    | `final-format-check.txt`                |
| `pnpm run build`                                                                 | `pnpm`                    | 0    | `final-build.txt`                       |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`                | `pnpm run rust:fmt:check` | 0    | `final-rust-fmt.txt`                    |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | `pnpm run rust:clippy`    | 0    | `final-rust-clippy.txt`                 |
| `cargo test --manifest-path src-tauri/Cargo.toml`                                | `pnpm run rust:test`      | 0    | `final-rust-test.txt` (1 passed)        |
| `git diff --check`                                                               | —                         | 0    | —                                       |

Baseline before any edit (same worktree, `origin/main`): `baseline-test.txt` (38 files,
207 passed), `baseline-fmt.txt` (exit 0), `baseline-clippy.txt` (exit 0).

## RED before GREEN

- `t1-red-ts.txt` — new/changed TS tests before the source edit: `pnpm test` exit 1,
  5 failed / 206 passed (`rail.test.tsx` region-toggle cases, `app-shell.test.tsx`
  drawn-chrome absence cases, `messages.test.ts` removed-copy case).
- `t1-red-rust.txt` — the compile-time menu-contract test added before the declaration:
  `cargo test` exit 101, `error[E0432]: unresolved import 'super::default_app_menu'`.
- `t1-green-ts.txt` — after the source edit: `pnpm test` exit 0, 211 passed / 38 files.
- `t1-green-rust.txt` — after the declaration: `cargo test` exit 0, 1 passed.

## DOM smoke (text only, no images)

Dev server: `pnpm run dev` → `http://localhost:1420/` (vite, strictPort).

- `dom-smoke.txt` — `.title-bar` 0, `.menu-bar` 0, `.window-controls` 0, `.nav-history` 0,
  `.rail` 1, `.rail button` 3 (Inicio, Alternar barra lateral, Alternar panel derecho);
  every removed label absent from `document.body.innerText`.
- `rail-toggle-smoke.txt` — clicking the rail toggles flips `.sidebar` (0→1→0) and
  `.right-panel:not([hidden])` (0→1), and each toggle's `aria-pressed` follows its own region.

This proves absence of the drawn chrome in the DOM and that the relocated toggles work. It
does **not** prove the native OS frame or the native menu: those require an OS host, and this
run is a plain webview/browser at 1280x577 (not the 1440x900 desktop baseline).
