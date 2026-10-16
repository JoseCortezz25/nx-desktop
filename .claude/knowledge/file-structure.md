# File Structure Conventions

**Strict rules for directory layout, file naming, Rust/TypeScript module conventions, and Atomic Design placement in `nx-desktop`.**

---

## 1. Project Directory Tree (Target Incremental Layout)

Create folders only as features are implemented—never pre-create empty directory trees.

```text
nx-desktop/
├── src/                                  # React 19 + TypeScript Frontend
│   ├── main.tsx                          # React entrypoint
│   ├── App.tsx                           # Root view / transitional shell
│   ├── app/
│   │   ├── providers.tsx                 # UI composition, i18n, context providers
│   │   └── app-shell.tsx                 # Window regions: TitleBar, Rail, Sidebar, Main, RightPanel
│   ├── features/                         # Modular feature slices
│   │   ├── providers/
│   │   │   ├── api/
│   │   │   │   ├── provider-client.ts    # Typed IPC calls for providers
│   │   │   │   └── provider.contracts.ts # Feature DTO types
│   │   │   ├── hooks/
│   │   │   │   └── use-provider-catalog.ts
│   │   │   ├── stores/
│   │   │   │   └── provider-selection.store.ts
│   │   │   ├── model/
│   │   │   │   └── provider.types.ts
│   │   │   ├── messages.ts               # Feature i18n message keys/maps
│   │   │   └── ui/                       # Atomic Design within the feature
│   │   │       ├── atoms/
│   │   │       ├── molecules/
│   │   │       └── organisms/
│   │   │           ├── provider-picker.tsx
│   │   │           ├── model-picker.tsx
│   │   │           └── effort-picker.tsx
│   │   ├── projects/
│   │   │   ├── api/project-client.ts
│   │   │   ├── hooks/use-projects.ts
│   │   │   └── ui/
│   │   │       ├── molecules/
│   │   │       └── organisms/
│   │   │           ├── project-picker.tsx
│   │   │           └── create-project-dialog.tsx
│   │   ├── conversations/
│   │   │   ├── api/conversation-client.ts
│   │   │   ├── hooks/use-conversation.ts
│   │   │   └── ui/
│   │   │       ├── atoms/
│   │   │       ├── molecules/
│   │   │       └── organisms/
│   │   │           ├── composer.tsx
│   │   │           └── conversation-view.tsx
│   │   └── runs/
│   │       ├── api/run-client.ts
│   │       ├── hooks/use-run-stream.ts
│   │       └── ui/
│   │           ├── atoms/
│   │           ├── molecules/
│   │           │   ├── tool-activity-row.tsx
│   │           │   └── hook-row.tsx
│   │           └── organisms/
│   │               ├── run-status.tsx
│   │               ├── hooks-review-modal.tsx
│   │               └── diff-view.tsx
│   └── shared/                           # Cross-cutting frontend primitives (used by 2+ features)
│       ├── ipc/
│       │   ├── client.ts                 # Thin invoke/Channel wrapper & error normalizer
│       │   └── contracts.ts              # Shared error/envelope DTOs (AppErrorDto)
│       ├── i18n/
│       │   └── messages.ts               # Shared UI translations
│       └── ui/                           # Shared Atomic Design system
│           ├── atoms/                    # button.tsx, badge.tsx, icon.tsx, file-chip.tsx
│           ├── molecules/                # popover.tsx, dialog.tsx, context-bar.tsx, message-actions.tsx
│           ├── organisms/                # right-panel.tsx, sidebar.tsx, title-bar.tsx
│           └── layout/                   # window region primitives
│
├── src-tauri/                            # Rust 2024 Local Core (Tauri 2)
│   ├── Cargo.toml
│   ├── rustfmt.toml
│   ├── build.rs                          # Tauri build & AppManifest commands
│   ├── tauri.conf.json
│   ├── capabilities/
│   │   └── default.json                  # Window capabilities
│   ├── permissions/                      # Custom command ACL permissions
│   ├── src/
│   │   ├── main.rs                       # Minimal binary entry
│   │   ├── lib.rs                        # Composition, state registration, generate_handler!
│   │   ├── app_state.rs                  # Long-lived managed services container
│   │   ├── ipc/
│   │   │   ├── mod.rs
│   │   │   └── error.rs                  # AppErrorDto and error mapping
│   │   ├── security/
│   │   │   ├── mod.rs
│   │   │   └── path_policy.rs            # Workspace path canonicalization & scope checks
│   │   └── features/
│   │       ├── mod.rs
│   │       ├── providers/
│   │       │   ├── mod.rs
│   │       │   ├── commands.rs           # Tauri #[tauri::command] entrypoints
│   │       │   ├── dto.rs                # Serde camelCase DTOs
│   │       │   ├── service.rs            # Use cases
│   │       │   ├── domain.rs             # ProviderId, ModelId, catalog invariants
│   │       │   ├── ports.rs              # AgentProvider trait
│   │       │   └── adapters/
│   │       │       ├── mod.rs
│   │       │       ├── opencode.rs
│   │       │       ├── codex.rs
│   │       │       └── claude.rs
│   │       ├── projects/
│   │       │   ├── mod.rs
│   │       │   ├── commands.rs
│   │       │   ├── dto.rs
│   │       │   ├── service.rs
│   │       │   └── domain.rs
│   │       ├── conversations/
│   │       │   ├── mod.rs
│   │       │   ├── commands.rs
│   │       │   ├── dto.rs
│   │       │   ├── service.rs
│   │       │   └── domain.rs
│   │       └── runs/
│   │           ├── mod.rs
│   │           ├── commands.rs
│   │           ├── dto.rs
│   │           ├── service.rs
│   │           └── supervisor.rs         # Active run registry & cancellation handles
│   └── tests/                            # Rust integration & contract tests
│
└── docs/
    ├── wireframes/                       # Visual & interaction specifications (01..20)
    └── research-tecnico/
        ├── README.md
        └── arquitectura-tauri.md         # Canonical architectural research
```

---

## 2. File & Symbol Naming Table

| Element                             | Convention                       | Valid Example                                 | Invalid Example                            |
| ----------------------------------- | -------------------------------- | --------------------------------------------- | ------------------------------------------ |
| **TS/TSX folders & files**          | `kebab-case`                     | `provider-picker.tsx`, `use-run-stream.ts`    | `ProviderPicker.tsx`, `useRunStream.ts`    |
| **React Components & TS Types**     | `PascalCase`                     | `ProviderPicker`, `RunDto`, `StartRunRequest` | `providerPicker`, `IRunDto`, `RunDtoModel` |
| **TS functions & variables**        | `camelCase`                      | `startRun`, `selectedProviderId`              | `start_run`, `SelectedProviderId`          |
| **TS boolean variables**            | `is/has/should/can` prefix       | `isStreaming`, `hasError`, `canApprove`       | `streaming`, `error`                       |
| **TS event handlers**               | `handle*` (impl) / `on*` (props) | `handleSelectModel`, `onSelectModel`          | `selectModel`                              |
| **Zustand UI stores**               | `{capability}.store.ts`          | `sidebar.store.ts`, `right-panel.store.ts`    | `app.store.ts`, `globalStore.ts`           |
| **Rust modules, functions, fields** | `snake_case`                     | `app_state.rs`, `start_run`, `run_id`         | `appState.rs`, `startRun`, `runId`         |
| **Rust structs, enums, traits**     | `UpperCamelCase`                 | `RunDto`, `AgentProvider`, `RunStatus`        | `run_dto`, `IAgentProvider`                |
| **Rust & TS constants**             | `SCREAMING_SNAKE_CASE`           | `MAX_PROMPT_BYTES`, `DEFAULT_TIMEOUT_MS`      | `maxPromptBytes`                           |
| **Tauri IPC commands**              | `snake_case` (verb + intent)     | `list_providers`, `start_run`, `cancel_run`   | `execute`, `getProviders`, `runShell`      |
| **JSON DTO fields (Serde)**         | `camelCase`                      | `providerId`, `conversationId`, `runId`       | `provider_id`, `RunID`                     |
| **Public error codes**              | `snake_case`                     | `provider_unavailable`, `permission_denied`   | `ERR_PROVIDER`, `ProviderUnavailable`      |
| **Tauri application events**        | `kebab-case`                     | `run-progress`, `provider-status-changed`     | `RUN_PROGRESS`, `runProgress`              |

---

## 3. Import & Visibility Rules

1. **No Barrel Files (`index.ts`) in Frontend**: Import directly from the concrete file path (e.g., `import { Button } from '@/shared/ui/atoms/button'`) to avoid circular dependencies.
2. **Rust Module Encapsulation**: In `src-tauri/src/features/<feature>/mod.rs`, expose only what `lib.rs` or sibling modules strictly require (`pub mod commands;`). Keep internal helpers and adapter details `pub(crate)` or private.
3. **No Generic `utils/` Folder**: Name shared helper modules after their specific domain/responsibility (`path_policy.rs`, `error_mapping.rs`, `format-timestamp.ts`).
