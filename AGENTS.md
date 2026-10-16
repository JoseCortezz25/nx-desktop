# AGENTS.md — `nx-desktop` Agent Harness

This file is the authoritative context entrypoint for AI coding agents working in `nx-desktop`.

---

## Project Overview

`nx-desktop` is a provider-agnostic desktop coding-agent application built with **Tauri 2 (Rust 2024)** and **React 19 (TypeScript ~6.0 + Vite 8)**.

- **Architecture**: **Modular Monolith by Feature** (`src/features/` + `src-tauri/src/features/`) with **Selective Ports & Adapters** at external Rust boundaries (`AgentProvider`, workspace FS, processes) and **Atomic Design** (`atoms/`, `molecules/`, `organisms/`) for all UI components.
- **Canonical Technical Research**: [`docs/research-tecnico/arquitectura-tauri.md`](docs/research-tecnico/arquitectura-tauri.md)
- **Visual & Interaction Specs**: [`docs/wireframes/README.md`](docs/wireframes/README.md)

---

## CRITICAL — READ FIRST

Before planning or editing any code, load:

1. **`.opencode/knowledge/critical-constraints.md`** — Non-negotiable architectural, IPC, Atomic Design, security, and concurrency guardrails.
2. **Matching `.opencode/rules/*.md`** and **`.opencode/skills/*/SKILL.md`** for the files/layers you touch.

---

## Core Architectural Rules (Summary)

- **Execution Flow**: `React Organism → Feature Hook → Typed IPC Client → Tauri Command (DTO validation) → Rust Use Case (service.rs) → Port (trait) → Concrete Adapter`.
- **Atomic Design (Mandatory)**: Classify every UI component in `src/shared/ui/` (reused by 2+ features) and `src/features/<feature>/ui/` (1 feature) into `atoms/`, `molecules/`, or `organisms/`.
  - **Atoms & Molecules**: Pure props/callbacks, zero IPC calls, zero store access, no outer margins (`margin`, `top`, `left`).
  - **Organisms**: Connect feature hooks and segmented UI stores to molecules and atoms.
  - **Import direction**: `Organism → Molecule → Atom`. Never import upward.
- **Zero Raw IPC in Views**: Never call `@tauri-apps/api/core` `invoke` or `listen` inside components. Encapsulate IPC in `src/features/<feature>/api/<feature>-client.ts` via `src/shared/ipc/client.ts`.
- **Intent-Driven Commands**: Use specific `snake_case` commands (`list_providers`, `start_run`, `cancel_run`). Universal gateways (`execute`, `run_shell`) are forbidden.
- **Three Distinct Models**: Keep IPC DTOs (`#[serde(rename_all = "camelCase")]`), Rust domain models, and vendor wire formats separate. Return `Result<TDto, AppErrorDto>`.
- **Four-Tier Boundary Validation**: Validate **Shape**, **Limits**, **Invariants** (`provider -> model -> effort`), and **Authority** (canonicalized workspace path + core approval policy) in Rust.
- **Single State Authority**: Rust owns active runs (`RunSupervisor`), credentials, workspace permissions, and history. React owns ephemeral presentation state (`useState` or single-capability `*.store.ts`). Never hold a `MutexGuard` across `.await`.
- **English-Only Identifiers & i18n Copy**: 100% English identifiers in TS and Rust (`kebab-case` TS files, `snake_case` Rust modules/commands, `PascalCase` components/types). Externalize all UI strings in `messages.ts`; never hardcode wireframe placeholders (`"ChatGPT"`, `"GPT-6.1 Sol"`).

---

## Knowledge Base Map (`.opencode/knowledge/` & `.claude/knowledge/`)

Disclosed reference material—load specific files or grep headings on demand:

| Document                                                                                       | When to Reach For It                                                                                  |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [`.opencode/knowledge/critical-constraints.md`](.opencode/knowledge/critical-constraints.md)   | **Always first** — non-negotiable rules & verification checklist                                      |
| [`.opencode/knowledge/architecture-patterns.md`](.opencode/knowledge/architecture-patterns.md) | Designing features, IPC commands, `Channel` streaming, dependency matrix                              |
| [`.opencode/knowledge/file-structure.md`](.opencode/knowledge/file-structure.md)               | Creating files/folders, checking naming conventions across TS & Rust                                  |
| [`.opencode/knowledge/business-logic.md`](.opencode/knowledge/business-logic.md)               | Implementing `Provider`, `Model`, `Run`, `Project`, `ApprovalMode`, `Hook`, or open product questions |
| [`.opencode/knowledge/tech-stack.md`](.opencode/knowledge/tech-stack.md)                       | Commands, deterministic judges, dependencies, and build/test scripts                                  |
| [`docs/research-tecnico/arquitectura-tauri.md`](docs/research-tecnico/arquitectura-tauri.md)   | Deep architectural rationale and primary Tauri 2 / Rust / Serde / React sources                       |

---

## Coding Rules (`.opencode/rules/` & `.claude/rules/`)

Path-scoped rules applied automatically when working in matching files:

| Rule File                                                                      | Applies To                               | Enforces                                                                                           |
| ------------------------------------------------------------------------------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [`atomic-design.md`](.opencode/rules/atomic-design.md)                         | `src/**/*.{ts,tsx}`                      | Mandatory `Atom → Molecule → Organism` classification, import direction, prop boundaries           |
| [`code-quality.md`](.opencode/rules/code-quality.md)                           | `src/**/*.{ts,tsx}`, `src-tauri/**/*.rs` | Strict TS (no `any`, named exports), Rust Clippy (`-D warnings`), no `.unwrap()` on fallible paths |
| [`naming-conventions.md`](.opencode/rules/naming-conventions.md)               | `src/**/*.{ts,tsx}`, `src-tauri/**/*.rs` | Casing and suffixes across TS, React, Rust, IPC commands, Serde JSON, and events                   |
| [`naming-language.md`](.opencode/rules/naming-language.md)                     | `src/**/*.{ts,tsx}`, `src-tauri/**/*.rs` | 100% English source-code identifiers and filenames                                                 |
| [`folder-structure.md`](.opencode/rules/folder-structure.md)                   | `src/**/*.{ts,tsx}`, `src-tauri/**/*.rs` | Feature-modular layout in `src/features/` & `src-tauri/src/features/`, no generic `utils/`         |
| [`ipc-and-contracts.md`](.opencode/rules/ipc-and-contracts.md)                 | `src/**/*.{ts,tsx}`, `src-tauri/**/*.rs` | DTO separation, Serde `camelCase`, 4-tier validation, `AppErrorDto`, `Channel` streaming           |
| [`security-and-capabilities.md`](.opencode/rules/security-and-capabilities.md) | `src-tauri/**/*`, `src/**/*.{ts,tsx}`    | Custom command ACLs, workspace `path_policy`, secret isolation, sidecar/tool approval              |
| [`state-and-concurrency.md`](.opencode/rules/state-and-concurrency.md)         | `src/**/*.{ts,tsx}`, `src-tauri/**/*.rs` | State authority, idempotent `unlisten`, Tokio lock hygiene, `cancel_run` propagation               |
| [`text-management.md`](.opencode/rules/text-management.md)                     | `src/**/*.{ts,tsx}`                      | `messages.ts` & `src/shared/i18n/`, zero hardcoded UI copy or wireframe placeholders               |

---

## Project Skills (`.opencode/skills/` & `.claude/skills/` → `.agents/skills/`)

Load the matching `SKILL.md` before executing any task in its domain:

| Skill                  | Trigger / Purpose                                                                         | Path                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `atomic-design`        | Classify, create, or split UI components into `atoms/`, `molecules/`, `organisms/`        | [`.opencode/skills/atomic-design/SKILL.md`](.opencode/skills/atomic-design/SKILL.md)               |
| `tauri-ipc-command`    | Create end-to-end typed Tauri 2 IPC commands, DTOs, `Channel` streams, and TS clients     | [`.opencode/skills/tauri-ipc-command/SKILL.md`](.opencode/skills/tauri-ipc-command/SKILL.md)       |
| `tauri-security-audit` | Audit Tauri capabilities, ACL permissions, workspace paths, secrets, and tool approvals   | [`.opencode/skills/tauri-security-audit/SKILL.md`](.opencode/skills/tauri-security-audit/SKILL.md) |
| `rust-tauri-core`      | Build modular Rust features, ports/adapters, `RunSupervisor`, and Tokio concurrency       | [`.opencode/skills/rust-tauri-core/SKILL.md`](.opencode/skills/rust-tauri-core/SKILL.md)           |
| `react-19`             | React 19 patterns, IPC listener cleanup, selection chain reconciliation, segmented stores | [`.opencode/skills/react-19/SKILL.md`](.opencode/skills/react-19/SKILL.md)                         |
| `typescript`           | Strict TypeScript, `as const` types, discriminated unions, type guards, zero `any`        | [`.opencode/skills/typescript/SKILL.md`](.opencode/skills/typescript/SKILL.md)                     |
| `commit-conventions`   | Format commits, branch names, and PR descriptions to pass deterministic judges            | [`.opencode/skills/commit-conventions/SKILL.md`](.opencode/skills/commit-conventions/SKILL.md)     |
| `naming-language`      | Enforce 100% English source-code identifiers across TypeScript and Rust                   | [`.opencode/skills/naming-language/SKILL.md`](.opencode/skills/naming-language/SKILL.md)           |

---

## Agent Hooks & Deterministic Judges

### Agent Runtime Hooks (`.claude/hooks/` & `.opencode/hooks/`)

- **PreToolUse (`block-dangerous-commands.mjs`)**: Blocks destructive Git commands (`push --force`, `reset --hard`, `clean -f`, `branch -D`, `checkout/restore .`), hook bypasses (`--no-verify`), `Co-Authored-By` trailers, and direct edits to `src-tauri/target/`, `dist/`, or `node_modules/`.
- **PostToolUse (`format-and-lint.mjs`)**: Automatically formats and lint-fixes modified `.ts/.tsx/.js/.json/.css/.md` files with Prettier + ESLint and `.rs` files with `rustfmt --edition 2024`.

### Repository Deterministic Judges (`.husky/` & CI)

- **`.husky/pre-commit`**: Validates branch naming (`^(feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)\/[a-z0-9._-]+$` or `main`), runs `lint-staged` (Prettier + ESLint on staged frontend files), and runs `cargo fmt --check` when `.rs` files are staged.
- **`.husky/commit-msg`**: Enforces Conventional Commits (`<= 100` chars, lowercase type, imperative mood) via Commitlint + regex and rejects `Co-Authored-By` trailers.
- **`.husky/pre-push` & `scripts/verify-pr-conventions.mjs`**: Enforces branch naming, PR title/body contract (`.github/PULL_REQUEST_TEMPLATE.md`), `pnpm run typecheck`, `pnpm run lint`, and `pnpm run rust:clippy`.

---

## MCP Servers (`.mcp.json` & `opencode.json`)

- **`context7`** — Up-to-date Tauri 2, Rust, Serde, Tokio, and React 19 documentation.
- **`chrome-devtools`** & **`playwright`** — Webview UI inspection, snapshots, and E2E verification.
- **`shadcn`** — Accessible UI component primitives reference.
- **`Figma Desktop`** — Design token and layout inspection.
- **`engram`** — Persistent cross-session project memory.
