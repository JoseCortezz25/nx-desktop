# Architecture Patterns

**Complete definition of architecture, process boundaries, layers, IPC protocols, and component patterns for `nx-desktop`.**

---

## 1. Process Model & Boundaries

`nx-desktop` is a desktop coding-agent application built with **Tauri 2 (Rust 2024)** and **React 19 (TypeScript + Vite)**. Three distinct runtime boundaries exist:

1. **UI (Webview Frontend)**: Executes React 19 inside the system webview. Owns layout, accessibility, ephemeral view state, and user intent capture.
2. **Local Core (Rust Main Process)**: Manages native OS integration, workspace authority, credentials, run supervision, persistence, and agent engine orchestration. There is no embedded Node.js server; React and Rust communicate via Tauri IPC.
3. **External Agent Engines / Remote Services**: Coding-agent engines (`OpenCode`, `Codex`, `Claude`) and remote APIs. An agent engine is not merely an LLM chat HTTP endpoint—it may manage sessions, tools, worktrees, and multiple models via SDK, HTTP, or local child process/sidecar.

---

## 2. Architectural Style: Modular Monolith + Selective Ports & Adapters + Atomic Design

- **Modular Monolith by Feature**: Both `src/features/` and `src-tauri/src/features/` are organized around business capabilities (`providers`, `projects`, `conversations`, `runs`, `hooks`) rather than technical layers (`controllers/`, `services/`, `repositories/`).
- **Selective Ports & Adapters (Hexagonal Boundaries)**: Inside the Rust core, use cases (`service.rs`) depend on ports (`ports.rs`) only where a real external boundary or multiple implementations exist (e.g., `AgentProvider`, `WorkspaceFs`, `CredentialStore`). Avoid traits for pure internal helpers.
- **Atomic Design in UI**: Both shared UI (`src/shared/ui/`) and feature UI (`src/features/<feature>/ui/`) structure components into `atoms/`, `molecules/`, and `organisms/`.

### High-Level Dependency Flow

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                        REACT FRONTEND (src/)                            │
│                                                                         │
│  app/ (AppShell, Providers)                                             │
│    ↓                                                                    │
│  features/<feature>/                                                    │
│    ├── ui/organisms/   (Composer, ConversationView, RightPanel)         │
│    │     ↓ uses                                                         │
│    ├── hooks/          (useConversation, useRunStream)                  │
│    ├── stores/         (segmented UI-only stores)                       │
│    ├── ui/molecules/   (HookRow, ToolActivityRow, ContextBar)           │
│    ├── ui/atoms/       (StatusBadge, EffortStop)                        │
│    └── api/            (provider-client.ts, run-client.ts)              │
│          ↓ calls                                                        │
│  shared/ (ipc/client.ts, ipc/contracts.ts, ui/atoms|molecules, i18n/)   │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ Tauri IPC (invoke / Channel / Events)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      RUST LOCAL CORE (src-tauri/)                       │
│                                                                         │
│  lib.rs (Composition, State management, generate_handler!)              │
│    ↓                                                                    │
│  features/<feature>/                                                    │
│    ├── commands.rs     (Input adapter: DTO validation, error mapping)   │
│    ├── dto.rs          (Serde camelCase contracts)                      │
│    ├── service.rs      (Use cases: policy orchestration & sequence)     │
│    ├── domain.rs       (Entities, Value Objects, Invariants)            │
│    ├── ports.rs        (Traits for external boundaries: AgentProvider)  │
│    └── adapters/       (Codex, Claude, OpenCode, OS process/HTTP/FS)    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Layer Responsibilities & Dependency Matrix

| Piece                                           | Must Do                                                                                               | Must Avoid                                                                      |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **React Atom** (`ui/atoms/`)                    | Render a single primitive via props; manage visual variants                                           | Hooks with side effects, stores, IPC calls, outer margins                       |
| **React Molecule** (`ui/molecules/`)            | Compose 2+ atoms for one UI task; pass props down and events up                                       | Calling IPC clients, reading global stores, domain business rules               |
| **React Organism** (`ui/organisms/`)            | Render a complete UI section; connect feature hooks to molecules/atoms                                | Raw `invoke()` / `listen()` calls, duplicating Rust domain policies             |
| **Feature Hook** (`hooks/`)                     | Coordinate UI interaction, manage `Channel`/`unlisten` lifecycle, discard stale responses             | Becoming a second backend rule engine                                           |
| **Frontend IPC Client** (`api/`, `shared/ipc/`) | Wrap command names, typed DTOs, `Channel` creation, and `unknown` error normalization                 | Importing React components or deciding business permissions                     |
| **Tauri Command** (`commands.rs`)               | Receive DTO, validate boundary, extract `State`, invoke use case, map internal error to `AppErrorDto` | Implementing provider protocols or raw SQL/HTTP inline                          |
| **Rust Use Case** (`service.rs`)                | Coordinate product policies, workspace authority, and run lifecycle                                   | Depending on `WebviewWindow`, React concepts, or provider wire formats          |
| **Rust Domain** (`domain.rs`)                   | Enforce identities (`ProviderId`, `ModelId`, `RunId`), invariants, and state transitions              | Importing `tauri`, `reqwest`, or serialization attributes tied to external APIs |
| **Rust Adapter** (`adapters/`)                  | Translate between internal ports and external HTTP, CLI processes, or filesystem                      | Leaking raw vendor payloads or unmapped errors to the rest of the app           |

### Frontend Dependency Matrix

| From ↓ / To →                   | `app/` | `features/<same>`        | `features/<other>` | `shared/ui/organisms` | `shared/ui/molecules` | `shared/ui/atoms` | `shared/ipc` & `i18n` |
| ------------------------------- | ------ | ------------------------ | ------------------ | --------------------- | --------------------- | ----------------- | --------------------- |
| **`app/`**                      | ✅     | ✅                       | ✅                 | ✅                    | ✅                    | ✅                | ✅                    |
| **`features/<x>/ui/organisms`** | ❌     | ✅                       | ❌                 | ✅                    | ✅                    | ✅                | ✅                    |
| **`features/<x>/ui/molecules`** | ❌     | `atoms` only             | ❌                 | ❌                    | ✅                    | ✅                | `i18n` only           |
| **`features/<x>/ui/atoms`**     | ❌     | ❌                       | ❌                 | ❌                    | ❌                    | ✅                | `i18n` only           |
| **`features/<x>/hooks`**        | ❌     | `api`, `stores`, `model` | ❌                 | ❌                    | ❌                    | ❌                | ✅                    |
| **`features/<x>/api`**          | ❌     | `model`                  | ❌                 | ❌                    | ❌                    | ❌                | ✅                    |
| **`shared/ui/*`**               | ❌     | ❌                       | ❌                 | Equal/lower level     | `molecules`, `atoms`  | `atoms` only      | `i18n` only           |

---

## 4. IPC & Streaming Protocols

### Choosing the Right Mechanism

| Need                                              | Mechanism                                      | Contract Required                                                                                                |
| ------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Query providers, create project, start/cancel run | Command + `invoke`                             | Request DTO, Response DTO, `AppErrorDto`                                                                         |
| Incremental output / progress of a `Run`          | `Channel<RunStreamEventDto>` passed to command | `runId`, `seq`, discriminated union (`started`, `textDelta`, `toolActivity`, `completed`, `failed`, `cancelled`) |
| Notify multiple views of a state change           | Targeted or global Tauri Event                 | Event name (`kebab-case`), payload DTO, publisher, listener cleanup                                              |
| External provider API                             | Rust HTTP client inside an adapter             | Auth, timeout, rate-limit handling, cancellation propagation                                                     |
| External CLI agent binary                         | Rust process adapter or Tauri sidecar          | Binary identity, array args, authorized `cwd`, minimal env, stdout/stderr reader, kill-tree on cancel            |

### Streaming Contract Rules

1. **Tag every stream frame** with `runId` and monotonic `seq`.
2. **Register the `Channel` callback before invoking** the command so early events are never missed.
3. **Batch small text deltas** and bound buffer sizes so IPC and React rendering stay smooth.
4. **Authoritative Snapshot on Reopen**: Treat the stream as a live progress view. If a panel unmounts and remounts, query the authoritative state snapshot from Rust rather than relying on the UI having buffered every historical delta.

---

## 5. Error Handling & Contract Serialization

```rust
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StartRunRequest {
    pub conversation_id: String,
    pub provider_id: String,
    pub model_id: String,
    pub prompt: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppErrorDto {
    pub code: String,
    pub message: String,
    pub retryable: bool,
    pub request_id: String,
}
```

- All Tauri commands return `Result<TDto, AppErrorDto>`.
- Frontend `shared/ipc/client.ts` catches rejected promises from `invoke()`, normalizes `unknown` into a typed `AppError`, and surfaces `code` for `i18n` translation and `requestId` for log correlation.
