<div align="center">

# nx-desktop

![Tauri](https://img.shields.io/badge/Tauri-2.12-24C8D8?style=for-the-badge&logo=tauri&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-2024_Edition-000000?style=for-the-badge&logo=rust&logoColor=white)
![React](https://img.shields.io/badge/React-19.3-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8.3-646CFF?style=for-the-badge&logo=vite&logoColor=white)

**Provider-agnostic desktop coding-agent application built with Tauri 2, Rust 2024, React 19, and TypeScript.**

[Quick Start](#-quick-start) • [Architecture](#-architecture) • [Atomic Design](#-atomic-design-ui-hierarchy) • [Tech Stack](#-tech-stack) • [Deterministic Judges](#-deterministic-judges--quality-gates) • [AI Agent Harness](#-ai-agent-harness) • [Documentation](#-documentation)

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Quick Start](#-quick-start)
- [Architecture](#-architecture)
- [Atomic Design UI Hierarchy](#-atomic-design-ui-hierarchy)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Available Scripts](#-available-scripts)
- [Deterministic Judges & Quality Gates](#-deterministic-judges--quality-gates)
- [AI Agent Harness](#-ai-agent-harness)
- [Documentation](#-documentation)
- [Contributing](#-contributing)

---

## 🎯 Overview

`nx-desktop` is a native desktop coding-agent workspace that unifies multiple coding-agent engines (**OpenCode**, **Codex**, **Claude**) behind a single desktop interface. Users manage multi-folder **Projects**, run streaming coding **Conversations**, switch **Provider → Model → Effort** chains dynamically, control tool **Approval Modes** (`ask_always`, `auto_approve`, `full_access`) and **`PreToolUse` Hooks**, and inspect file changes in an integrated **Right Panel** (`DocumentView`, `CodeView`, `DiffView`).

### Key Highlights

- 🦀 **Tauri 2 + Rust 2024 Local Core** — Native process supervision, workspace path canonicalization, secret isolation, and typed IPC contracts.
- ⚛️ **React 19 + TypeScript 6 Frontend** — Fast SPA webview with strict typing and zero raw IPC calls inside visual components.
- 🏗️ **Modular Monolith + Selective Ports & Adapters** — Feature-sliced organization across both `src/features/` and `src-tauri/src/features/`.
- 🧩 **Atomic Design Componentization** — Strict `Atom → Molecule → Organism` UI hierarchy in `src/shared/ui/` and `src/features/<feature>/ui/`.
- 🛡️ **Deterministic Judges** — Automated verification via Prettier, ESLint 9, TypeScript, `rustfmt`, `clippy`, Husky, Commitlint, and PR contract validators.
- 🤖 **Synchronized AI Agent Harness** — Ready-to-use `.claude/` and `.opencode/` harness with `knowledge/`, `rules/`, `hooks/`, `skills/`, and `.mcp.json`.

---

## 🚀 Quick Start

### Prerequisites

- **Node.js**: `>= 22`
- **pnpm**: `>= 10`
- **Rust Toolchain**: `cargo` & `rustfmt` & `clippy` (Rust Edition `2024`)
- **Tauri 2 OS Dependencies**: System webview and build libraries ([Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/))

### Installation & Development

```bash
# 1. Install frontend dependencies and initialize Husky git hooks
pnpm install

# 2. Run the Vite frontend dev server only
pnpm run dev

# 3. Run the full Tauri 2 desktop application in development mode
pnpm run tauri dev

# 4. Run all deterministic quality judges (Frontend + Rust)
pnpm run check
```

---

## 🏗️ Architecture

Grounded in [`docs/research-tecnico/arquitectura-tauri.md`](docs/research-tecnico/arquitectura-tauri.md), `nx-desktop` separates three runtime boundaries:

1. **UI (Webview Frontend)**: Renders React 19 components, manages ephemeral view state, and captures user intent.
2. **Local Core (Rust Main Process)**: Enforces workspace authority, supervises active agent runs (`RunSupervisor`), manages credentials, and exposes intent-driven IPC commands.
3. **External Agent Engines**: Provider integrations (`OpenCode`, `Codex`, `Claude`) connected via Rust adapters (HTTP, SDK, or child process/sidecar).

### Execution Flow Across IPC

```text
User Intent
  → React Organism (src/features/<feature>/ui/organisms/)
  → Feature Hook (src/features/<feature>/hooks/)
  → Typed Frontend IPC Client (src/features/<feature>/api/ + src/shared/ipc/client.ts)
  → Tauri Command [Input Adapter] (src-tauri/src/features/<feature>/commands.rs)
  → Rust Use Case (src-tauri/src/features/<feature>/service.rs)
  → Integration Port [Trait] (src-tauri/src/features/<feature>/ports.rs)
  → Concrete Adapter [HTTP / Process / FS] (src-tauri/src/features/<feature>/adapters/)
```

### Non-Negotiable Boundary Rules

- **Zero Raw `invoke()` in Components**: UI components never import `@tauri-apps/api` directly; all IPC traffic goes through typed feature clients and hooks.
- **Three Distinct Models**: IPC DTOs (`#[serde(rename_all = "camelCase")]`), Rust domain entities, and external provider payloads are never collapsed into a single struct.
- **Four-Tier Boundary Validation**: Every Rust command validates **Shape** (Serde), **Limits** (prompt size/timeouts), **Invariants** (`provider -> model -> effort`), and **Authority** (canonicalized `WorkspacePath` + approval policy).
- **Single Authority per State**: Rust owns active runs, credentials, and persisted history; React owns ephemeral presentation state (`useState` or single-capability `*.store.ts`).

---

## 🧩 Atomic Design UI Hierarchy

All UI components in `src/shared/ui/` (reused across 2+ features) and `src/features/<feature>/ui/` (feature-scoped) follow **Atomic Design**:

| Level        | Directory    | Responsibility                                                                                              | Allowed Dependencies                                          | Forbidden                                                                                 |
| ------------ | ------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Atom**     | `atoms/`     | Indivisible primitive (`Button`, `Badge`, `Icon`, `FileChip`, `StatusDot`, `Input`)                         | Props, visual variants, internal focus/hover                  | Feature hooks, IPC clients, stores, domain types, outer margins (`margin`, `top`, `left`) |
| **Molecule** | `molecules/` | Functional group of 2+ atoms (`Popover`, `Dialog`, `ContextBar`, `ToolActivityRow`, `HookRow`)              | Atoms, local UI state (`useState`, `useRef`), `on*` callbacks | IPC clients, stores, domain orchestration, outer layout positioning                       |
| **Organism** | `organisms/` | Self-contained product section (`Composer`, `ProviderPicker`, `ConversationView`, `RightPanel`, `DiffView`) | Feature hooks, segmented UI stores, molecules, atoms          | Direct `invoke()` / `listen()` calls                                                      |

**Import direction**: `Organism → Molecule → Atom`. Lower levels never import from higher levels.

---

## 🛠️ Tech Stack

| Category           | Technology                                               | Version        | Purpose                                                               |
| ------------------ | -------------------------------------------------------- | -------------- | --------------------------------------------------------------------- |
| **Desktop Shell**  | Tauri                                                    | `2.12.x`       | Native windowing, IPC commands, `Channel` streaming, capabilities ACL |
| **Local Core**     | Rust + Serde + Tokio                                     | `Edition 2024` | Domain services, security boundary, run supervisor, provider adapters |
| **Frontend UI**    | React                                                    | `19.3.x`       | Component architecture inside the system webview                      |
| **Language**       | TypeScript                                               | `~6.0.3`       | Strict static typing (`strict: true`, no `any`)                       |
| **Bundler**        | Vite                                                     | `8.3.x`        | HMR development server and production bundler                         |
| **Quality Judges** | ESLint 9, Prettier, Clippy, `rustfmt`, Husky, Commitlint | Latest         | Deterministic formatting, linting, commit, branch, and PR enforcement |

---

## 📁 Project Structure

```text
nx-desktop/
├── AGENTS.md                             # Context entrypoint for OpenCode & general AI agents
├── CLAUDE.md                             # Context entrypoint for Claude Code
├── RULES.md                              # Quick-reference engineering card
├── .mcp.json & opencode.json             # MCP server definitions & auto-formatter bindings
├── .agents/skills/                       # Canonical LLM-first project skills (8 skills)
├── .claude/ & .opencode/                 # Synchronized AI Agent Harness
│   ├── knowledge/                        # Architecture, constraints, domain logic, file structure, stack
│   ├── rules/                            # Path-scoped coding rules (Atomic Design, IPC, security, naming)
│   ├── hooks/                            # PreToolUse & PostToolUse Node.js guardrails
│   └── skills -> ../.agents/skills       # Symlink to canonical skills
├── .husky/                               # Deterministic Git hooks (pre-commit, commit-msg, pre-push)
├── scripts/
│   └── verify-pr-conventions.mjs         # Deterministic branch, commit, and PR contract judge
├── docs/
│   ├── research-tecnico/                 # Primary Tauri 2 architectural research
│   └── wireframes/                       # 20 HTML wireframes & visual specifications
├── src/                                  # React 19 + TypeScript Frontend
│   ├── app/                              # AppShell & global providers (incremental)
│   ├── features/                         # Feature slices (providers, projects, conversations, runs)
│   └── shared/                           # Shared IPC client, i18n messages, and shared Atomic UI
└── src-tauri/                            # Rust 2024 Local Core
    ├── capabilities/                     # Window capability permissions
    ├── rustfmt.toml                      # Rust formatting configuration
    └── src/                              # Composition (lib.rs) and feature modules
```

---

## 📜 Available Scripts

| Command                   | Description                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `pnpm run dev`            | Start Vite frontend development server                                                                  |
| `pnpm run tauri dev`      | Start full Tauri desktop application in development mode                                                |
| `pnpm run build`          | Typecheck with `tsc` and build frontend production bundle                                               |
| `pnpm run tauri build`    | Build native desktop application bundle                                                                 |
| `pnpm run check`          | **Run all deterministic judges** (`format:check`, `lint`, `typecheck`, `rust:fmt:check`, `rust:clippy`) |
| `pnpm run format`         | Format frontend, docs, and config files with Prettier                                                   |
| `pnpm run format:check`   | Verify Prettier formatting without modifying files                                                      |
| `pnpm run lint`           | Run ESLint 9 on `src/**/*.{ts,tsx}`                                                                     |
| `pnpm run lint:fix`       | Run ESLint 9 with automatic fixes                                                                       |
| `pnpm run typecheck`      | Run `tsc --noEmit` strict typecheck                                                                     |
| `pnpm test`               | Run the Vitest unit test suite (`vitest run`)                                                           |
| `pnpm run rust:fmt`       | Format all Rust code in `src-tauri/` with `rustfmt`                                                     |
| `pnpm run rust:fmt:check` | Check Rust formatting without modifying files                                                           |
| `pnpm run rust:clippy`    | Run `cargo clippy` denying all warnings (`-D warnings`)                                                 |
| `pnpm run rust:test`      | Run Rust unit and IPC serialization contract tests                                                      |
| `pnpm run check:pr`       | Verify branch naming, commit title, and PR body conventions                                             |

---

## 🛡️ Deterministic Judges & Quality Gates

Every change is verified by deterministic local and CI judges:

1. **`PreToolUse` Agent Hook (`.claude/hooks/block-dangerous-commands.mjs`)**:
   - Blocks `git push --force`, `git reset --hard`, `git clean -f`, `git branch -D`, `git checkout/restore .`, `--no-verify`, `Co-Authored-By` trailers, and direct edits to `src-tauri/target/`, `dist/`, or `node_modules/`.
2. **`PostToolUse` Agent Hook (`.claude/hooks/format-and-lint.mjs`)**:
   - Auto-runs Prettier + ESLint on edited frontend files and `rustfmt --edition 2024` on edited `.rs` files.
3. **`.husky/pre-commit`**:
   - Verifies branch name matches `^(feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)\/[a-z0-9._-]+$` (or `main`), runs `lint-staged`, and checks `cargo fmt --check` when `.rs` files are staged.
4. **`.husky/commit-msg`**:
   - Validates Conventional Commits (`<type>(<scope>): <description>`, `<= 100` chars, no trailing period, **zero `Co-Authored-By` attribution**) via `verify-pr-conventions.mjs` and `commitlint`.
5. **`.husky/pre-push` & `.github/workflows/pr-judge.yml`**:
   - Enforces branch naming, PR title/body contract (`.github/PULL_REQUEST_TEMPLATE.md` with `Closes #N`), `typecheck`, `lint`, `format:check`, and the Vitest unit tests (`pnpm test` → `vitest run`).

---

## 🤖 AI Agent Harness

Both **OpenCode** (`.opencode/` + `AGENTS.md` + `opencode.json`) and **Claude Code** (`.claude/` + `CLAUDE.md` + `.mcp.json`) share a synchronized harness:

### Project Skills (`.agents/skills/`)

| Skill                                                                  | Purpose                                                                               |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [`atomic-design`](.agents/skills/atomic-design/SKILL.md)               | Classify and build decoupled UI components (`Atom → Molecule → Organism`)             |
| [`tauri-ipc-command`](.agents/skills/tauri-ipc-command/SKILL.md)       | Create end-to-end typed Tauri 2 IPC commands, DTOs, `Channel` streams, and TS clients |
| [`tauri-security-audit`](.agents/skills/tauri-security-audit/SKILL.md) | Audit Tauri capabilities, ACLs, workspace path policies, secrets, and tool approvals  |
| [`rust-tauri-core`](.agents/skills/rust-tauri-core/SKILL.md)           | Build modular Rust features, ports/adapters, `RunSupervisor`, and Tokio concurrency   |
| [`react-19`](.agents/skills/react-19/SKILL.md)                         | React 19 patterns, idempotent `unlisten` cleanup, selection chain reconciliation      |
| [`typescript`](.agents/skills/typescript/SKILL.md)                     | Strict TypeScript, `as const` types, discriminated unions, type guards, zero `any`    |
| [`commit-conventions`](.agents/skills/commit-conventions/SKILL.md)     | Format commits, branch names, and PRs to pass deterministic judges                    |
| [`naming-language`](.agents/skills/naming-language/SKILL.md)           | Enforce 100% English source-code identifiers across TypeScript and Rust               |

### Configured MCP Servers (`.mcp.json` & `opencode.json`)

- **`context7`** — Up-to-date documentation for Tauri 2, Rust, Serde, Tokio, and React 19.
- **`chrome-devtools`** & **`playwright`** — Webview inspection, snapshots, and E2E verification.
- **`shadcn`** — Accessible UI component primitives reference.
- **`Figma Desktop`** — Design inspection and token extraction.
- **`engram`** — Persistent cross-session project memory.

---

## 📚 Documentation

- **[`AGENTS.md`](./AGENTS.md)** & **[`CLAUDE.md`](./CLAUDE.md)** — Master agent entrypoints.
- **[`RULES.md`](./RULES.md)** — Quick-reference engineering card.
- **[`docs/research-tecnico/arquitectura-tauri.md`](./docs/research-tecnico/arquitectura-tauri.md)** — Technical research & architectural guide for `nx-desktop`.
- **[`docs/wireframes/README.md`](./docs/wireframes/README.md)** — 20 HTML wireframes, reusable components, domain model, and open product questions.
- **[`.claude/knowledge/critical-constraints.md`](./.claude/knowledge/critical-constraints.md)** — Non-negotiable architectural constraints.

---

## 🤝 Contributing

1. Ensure an issue exists in GitHub Issues before starting work.
2. Create a branch following the convention: `git checkout -b feat/your-feature`.
3. Follow the rules in [`RULES.md`](./RULES.md) and run `pnpm run check` before committing.
4. Commit logical work units using Conventional Commits (`feat(scope): imperative description` — never include `Co-Authored-By`).
5. Open a Pull Request completing [`.github/PULL_REQUEST_TEMPLATE.md`](./.github/PULL_REQUEST_TEMPLATE.md) with `Closes #<issue-number>`.
