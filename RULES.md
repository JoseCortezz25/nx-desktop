# RULES.md — `nx-desktop` Quick-Reference Engineering Card

Fast reference for `nx-desktop` non-negotiable conventions.
Full detail in `.claude/rules/` (`.opencode/rules/`) and `.claude/knowledge/critical-constraints.md`.

---

## 1. Architecture & Boundaries

- **Modular Monolith by Feature**: Organize code under `src/features/<feature>/` (React) and `src-tauri/src/features/<feature>/` (Rust).
- **Selective Ports & Adapters**: Introduce traits in `ports.rs` only for external boundaries (`AgentProvider`, workspace FS, OS processes).
- **Strict IPC Flow**: `UI Organism → Feature Hook → Typed IPC Client → Tauri Command → Rust Service → Port → Adapter`.
- **No Raw IPC in Components**: Never import `invoke` or `listen` inside `.tsx` components.

---

## 2. Atomic Design (UI Components)

- Mandatory classification for all components in `src/shared/ui/` (2+ features) and `src/features/<feature>/ui/` (1 feature):
  - **Atoms (`atoms/`)**: Pure props, single element/primitive, zero hooks/stores/IPC, no outer `margin`/`top`/`left`.
  - **Molecules (`molecules/`)**: 2+ atoms working together, local UI state (`useState`/`useRef`) only, props down & events up, zero stores/IPC.
  - **Organisms (`organisms/`)**: Self-contained product sections (`Composer`, `ProviderPicker`, `RightPanel`, `DiffView`), connect feature hooks and segmented stores to molecules/atoms.
- Import direction: `Organism → Molecule → Atom`. Never import upward.

---

## 3. Naming & Language

- **100% English identifiers** across TypeScript and Rust.
- **TS/React**: `kebab-case.tsx` files, `PascalCase` components & types, `camelCase` functions/vars, `use-*.ts` hooks, `*.store.ts` stores, `is/has/should/can` booleans, `handle*` / `on*` events, named exports only.
- **Rust**: `snake_case` modules/functions/fields, `UpperCamelCase` structs/enums/traits, `SCREAMING_SNAKE_CASE` constants.
- **Tauri IPC**: `snake_case` intent-driven command names (`start_run`, `cancel_run`), `camelCase` JSON fields via `#[serde(rename_all = "camelCase")]`, `snake_case` error codes (`provider_unavailable`), `kebab-case` events (`run-progress`).

---

## 4. Security, State & Concurrency

- **4-Tier Command Validation**: Validate **Shape**, **Limits**, **Invariants** (`provider -> model -> effort`), and **Authority** (canonicalized `WorkspacePath` + core approval policy) in Rust.
- **Secrets**: Keep credentials strictly inside Rust adapters; never expose in JS, DTOs, or logs.
- **Single Authority**: Rust owns active runs, credentials, and persisted history; React owns ephemeral UI state.
- **Concurrency**: Never hold a synchronous `MutexGuard` across `.await`. Clean up IPC listeners idempotently (`unlisten`). Propagate `cancel_run` to underlying adapters/processes.

---

## 5. Git, Commits & PR Judges

- **Branch naming**: `^(feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)\/[a-z0-9._-]+$`
- **Commit messages**: `<type>(<scope>): <imperative description>` (`<= 100` chars, no period, **never** `Co-Authored-By`).
- **PR Contract**: Conventional Commit title + `.github/PULL_REQUEST_TEMPLATE.md` with `Closes #N` + passing `pnpm run check` and `pnpm run check:pr`.
