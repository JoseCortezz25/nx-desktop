# Tech Stack

**Technology stack, versions, deterministic quality judges, and development commands for `nx-desktop`.**

---

## 1. Core Technologies

| Layer                   | Technology                    | Version / Edition              | Purpose                                                                           |
| ----------------------- | ----------------------------- | ------------------------------ | --------------------------------------------------------------------------------- |
| **Desktop Shell & IPC** | Tauri                         | `^2` (`2.12.x` in lockfile)    | Native windowing, webview host, IPC commands, channels, events, capabilities      |
| **Local Core Language** | Rust                          | Edition `2024` (`cargo 1.99+`) | Local core use cases, security boundary, process/HTTP adapters, state supervision |
| **Serialization**       | Serde + `serde_json`          | `1.x`                          | Typed JSON serialization/deserialization across IPC and persistence               |
| **Async Runtime**       | Tokio (via Tauri)             | `1.x`                          | Async command execution, process/stream supervision, concurrency                  |
| **Frontend UI**         | React + React DOM             | `^19.1.0`                      | Component rendering inside the Tauri webview                                      |
| **Frontend Language**   | TypeScript                    | `~6.0.3` (`strict: true`)      | Static type checking for UI and IPC client contracts                              |
| **Frontend Bundler**    | Vite + `@vitejs/plugin-react` | `^8.0.16`                      | Fast HMR dev server and production SPA bundle                                     |
| **Native Plugins**      | `tauri-plugin-opener`         | `2.x`                          | Controlled external link/file opening                                             |

---

## 2. Deterministic Quality Judges

The repository enforces code quality, formatting, and Git/PR discipline through deterministic local and CI judges:

| Judge                    | Tool                                   | Scope                                       | Configuration                                                                            |
| ------------------------ | -------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Frontend Formatter**   | Prettier                               | `*.{ts,tsx,js,mjs,json,css,md}`             | `.prettierrc.json`, `.prettierignore`                                                    |
| **Frontend Linter**      | ESLint 9 (Flat Config)                 | `src/**/*.{ts,tsx}`                         | `eslint.config.mjs`                                                                      |
| **Frontend Typecheck**   | TypeScript (`tsc --noEmit`)            | `src/**/*.{ts,tsx}`                         | `tsconfig.json`                                                                          |
| **Rust Formatter**       | `rustfmt` (`cargo fmt`)                | `src-tauri/**/*.rs`                         | `src-tauri/rustfmt.toml`                                                                 |
| **Rust Linter**          | Clippy (`cargo clippy -- -D warnings`) | `src-tauri/**/*.rs`                         | `src-tauri/Cargo.toml`                                                                   |
| **Pre-commit Hook**      | Husky + `lint-staged`                  | Staged files + branch name check            | `.husky/pre-commit`, `package.json`                                                      |
| **Commit Message Judge** | Commitlint + Regex + No-AI check       | Commit message header & body                | `.husky/commit-msg`, `commitlint.config.mjs`                                             |
| **Pre-push & PR Judge**  | Branch + PR contract verifier          | Branch name, PR title, linked issue, checks | `.husky/pre-push`, `scripts/verify-pr-conventions.mjs`, `.github/workflows/pr-judge.yml` |

---

## 3. Command Reference

### Package Manager

Use **`pnpm`** (or `npm` if running in a bare environment, though `pnpm` is the workspace standard).

```bash
# Install dependencies and initialize Husky hooks
pnpm install
```

### Development & Build

```bash
# Start Vite frontend dev server only
pnpm run dev

# Start full Tauri desktop app in development mode
pnpm run tauri dev

# Build frontend (runs tsc + vite build)
pnpm run build

# Build full Tauri desktop bundle
pnpm run tauri build
```

### Deterministic Verification Commands

```bash
# TypeScript typecheck
pnpm run typecheck

# ESLint check and auto-fix
pnpm run lint
pnpm run lint:fix

# Prettier check and auto-format
pnpm run format:check
pnpm run format

# Rust format check and auto-format
pnpm run rust:fmt:check
pnpm run rust:fmt

# Rust Clippy lint check (warnings denied)
pnpm run rust:clippy

# Rust unit & contract tests
pnpm run rust:test

# Verify branch & PR conventions locally
pnpm run check:pr

# Run all deterministic checks (Frontend + Rust)
pnpm run check
```
