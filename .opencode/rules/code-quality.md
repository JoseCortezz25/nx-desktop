---
paths: src/**/*.{ts,tsx}, src-tauri/**/*.rs
---

# Code Quality, TypeScript & Rust Standards

This document defines the mandatory code quality rules enforced by ESLint, TypeScript, `rustfmt`, and `clippy`.

---

## 1. TypeScript Rules (`src/**/*.{ts,tsx}`)

- **No `any` (`@typescript-eslint/no-explicit-any: error`)**: Never use `any`. Use explicit types, discriminated unions, generics, or `unknown` with type guards.
- **No Unused Symbols (`@typescript-eslint/no-unused-vars: error`)**: Remove unused imports, variables, and parameters. Prefix intentionally unused parameters with `_` (e.g., `_event`).
- **Strict Type Imports**: Always use `import type { ... }` for type-only imports.
- **Named Exports Only**: Use named exports (`export function ...`) across all components, hooks, clients, and stores. Default exports are only allowed where required by tool config files (`vite.config.ts`, `eslint.config.mjs`).
- **Const Types over Raw String Unions**: Define constant objects with `as const` and derive union types from them when values are also used at runtime.
- **No `console.log` in Production Paths**: Use structured error handling or diagnostics; `no-console` is enforced as a warning/gate.

---

## 2. Rust Rules (`src-tauri/**/*.rs`)

- **Clippy Clean (`cargo clippy -- -D warnings`)**: All Rust code must pass Clippy with warnings denied.
- **No `.unwrap()` or `.expect()` on Fallible User/External Paths**: Inside commands, services, and adapters, propagate errors with `?` and convert them to domain/application errors mapped to `AppErrorDto`. `.expect()` is only acceptable at startup bootstrap in `lib::run()` if the application cannot start.
- **Thin `lib.rs` and `main.rs`**: Keep `main.rs` as the minimal entrypoint and `lib.rs` strictly for dependency wiring, `manage(...)`, plugins, and `tauri::generate_handler![]`.
- **Restricted Visibility**: Expose only necessary symbols in `mod.rs`; prefer private or `pub(crate)` for internal module helpers.
