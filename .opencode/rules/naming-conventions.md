---
paths: src/**/*.{ts,tsx}, src-tauri/**/*.rs
---

# Naming Conventions

Standardized nomenclature across TypeScript, React, Rust, and Tauri IPC boundaries.

---

## 1. Cross-Layer Naming Matrix

| Artifact                        | Convention                                         | Valid Example                                        | Invalid Example                            |
| ------------------------------- | -------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------ |
| **Directories (TS & Rust)**     | `kebab-case` (TS) / `snake_case` (Rust)            | `src/features/runs/`, `src-tauri/src/features/runs/` | `src/features/RunManager/`                 |
| **React Component Files**       | `kebab-case.tsx`                                   | `provider-picker.tsx`, `hook-row.tsx`                | `ProviderPicker.tsx`, `hookRow.tsx`        |
| **React Components**            | `PascalCase` (named export)                        | `export function ProviderPicker()`                   | `export default function providerPicker()` |
| **Component Props**             | `{ComponentName}Props`                             | `interface ProviderPickerProps`                      | `IProviderPickerProps`, `Props`            |
| **React Hook Files**            | `use-{name}.ts`                                    | `use-run-stream.ts`, `use-conversation.ts`           | `useRunStream.ts`, `run-stream.hook.ts`    |
| **Frontend IPC Clients**        | `{feature}-client.ts`                              | `provider-client.ts`, `run-client.ts`                | `providerService.ts`, `backendService.ts`  |
| **Frontend Contracts**          | `{feature}.contracts.ts`                           | `provider.contracts.ts`, `run.contracts.ts`          | `ProviderResponseDtoModel.ts`              |
| **Zustand UI Stores**           | `{capability}.store.ts`                            | `sidebar.store.ts`, `right-panel.store.ts`           | `app.store.ts`, `global.store.ts`          |
| **Boolean Variables (TS)**      | `is`, `has`, `should`, `can` prefix                | `isRunning`, `hasError`, `canCancel`                 | `running`, `error`, `cancelable`           |
| **Event Handlers (TS)**         | `handle*` (impl), `on*` (prop)                     | `handleCancelRun`, `onCancelRun`                     | `cancelRunClick`                           |
| **Rust Modules & Functions**    | `snake_case`                                       | `app_state.rs`, `start_run`, `cancel_run`            | `appState.rs`, `startRun`                  |
| **Rust Structs, Enums, Traits** | `UpperCamelCase`                                   | `StartRunRequest`, `RunDto`, `AgentProvider`         | `start_run_request`, `IAgentProvider`      |
| **Constants (TS & Rust)**       | `SCREAMING_SNAKE_CASE`                             | `MAX_PROMPT_BYTES`, `DEFAULT_TIMEOUT_MS`             | `maxPromptBytes`                           |
| **Tauri IPC Commands**          | `snake_case` (verb + intent)                       | `list_providers`, `start_run`, `cancel_run`          | `execute`, `runShell`, `getProviders`      |
| **JSON DTO Fields**             | `camelCase` (`#[serde(rename_all = "camelCase")]`) | `conversationId`, `providerId`, `runId`              | `conversation_id` in JSON                  |
| **Public Error Codes**          | `snake_case`                                       | `validation_failed`, `provider_unavailable`          | `ERR_VALIDATION`, `ProviderError`          |
| **Application Events**          | `kebab-case`                                       | `run-progress`, `provider-status-changed`            | `runProgress`, `RUN_PROGRESS`              |

---

## 2. Semantic Domain Naming Rules

- **Use domain-meaningful identifiers, not UI positions**: Name fields `conversationId` or `providerId`, never `selectedCardId` or `leftDropdownValue`.
- **Avoid stacked suffixes**: Use `StartRunRequest`, `RunDto`, and `Run` (domain). Never write `ProviderResponseDtoModel` or `backendService`.
