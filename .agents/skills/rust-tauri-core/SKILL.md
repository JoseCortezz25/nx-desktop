---
name: rust-tauri-core
description: 'Trigger: Rust core, src-tauri, service.rs, domain.rs, ports.rs, adapters, Tokio mutex, RunSupervisor, cancel_run. Build modular Rust backend features in Tauri 2.'
license: Apache-2.0
metadata:
  author: 'JoseCortezz25'
  version: '1.0'
---

## Activation Contract

Load this skill when:

- Writing or refactoring Rust code under `src-tauri/src/`.
- Designing feature modules (`commands.rs`, `dto.rs`, `service.rs`, `domain.rs`, `ports.rs`, `adapters/`).
- Managing shared state (`app_state.rs`), concurrency with Tokio, or run supervision and cancellation (`supervisor.rs`).

## Hard Rules

- Keep `src-tauri/src/lib.rs` solely for dependency composition, `manage()`, plugins, and `generate_handler![]`.
- Introduce a trait in `ports.rs` only when a real external boundary (`AgentProvider`, persistence, OS process) or multiple implementations exist.
- Never hold a synchronous `MutexGuard` across an `.await` suspension point. Clone or extract needed values, drop the lock, `.await` the I/O operation, and re-lock briefly to reconcile state.
- Do not serialize the entire application behind a single global `Mutex`; partition state by owner (`ProviderRegistry`, `RunSupervisor`).
- Never use `.unwrap()` or `.expect()` on fallible runtime paths in commands, services, or adapters; propagate with `?` into domain errors mapped to `AppErrorDto`.
- `cancel_run` must be idempotent, verify caller authority, propagate cancellation to the adapter/child process, and resolve completion-vs-cancellation races into a single terminal state.

## Decision Gates

| Need                                                       | Pattern in `src-tauri/src/`                                                   |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Pure domain rule or invariant (`ProviderId`, `ModelId`)    | Value object / function in `features/<f>/domain.rs` (no trait needed)         |
| External agent integration (`OpenCode`, `Codex`, `Claude`) | Port trait in `features/providers/ports.rs` + concrete struct in `adapters/`  |
| Long-lived active run tracking & cancellation              | `RunSupervisor` in `features/runs/supervisor.rs` registered in `app_state.rs` |
| CPU-heavy or blocking OS operation                         | Offload to blocking pool; never block the main thread or async executor       |

## Execution Steps

1. Model domain types and invariants in `domain.rs` without Tauri or HTTP dependencies.
2. Define port traits in `ports.rs` only if crossing an external integration seam, and provide an in-memory fake for unit tests.
3. Implement use-case orchestration in `service.rs` with short lock scopes and explicit cancellation propagation.
4. Wire commands in `commands.rs` and register module exports cleanly in `mod.rs`.
5. Run `pnpm run rust:fmt:check`, `pnpm run rust:clippy`, and `pnpm run rust:test`.

## Output Contract

Return:

- Rust module files created/updated following `snake_case` (modules/functions) and `UpperCamelCase` (types/traits).
- Verification that locks are not held across `.await` and `cargo clippy -- -D warnings` passes cleanly.

## References

- `../../docs/research-tecnico/arquitectura-tauri.md` — Sections 2, 3, 7, and 8.
- `../../.claude/rules/state-and-concurrency.md` — State and concurrency rules.
