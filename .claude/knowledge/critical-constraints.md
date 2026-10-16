# Critical Constraints

**Non-negotiable architectural and engineering rules for `nx-desktop` (Tauri 2 + Rust 2024 + React 19 + TypeScript).**

---

## 1. Modular Monolith with Selective Ports and Adapters

- **NEVER**: Dump business rules, provider protocols, or filesystem logic inside React components or raw Tauri `#[tauri::command]` functions.
- **NEVER**: Create empty Clean Architecture boilerplate layers or traits for pure functions without two plausible implementations or external side effects.
- **ALWAYS**: Organize both `src/features/` (React) and `src-tauri/src/features/` (Rust) by bounded feature modules (`providers`, `projects`, `conversations`, `runs`, `hooks`).
- **ALWAYS**: Follow the strict execution flow across the IPC boundary:

```text
User intent
  → React Organism / Feature Hook
  → Typed Frontend IPC Client (src/features/<feature>/api/ + src/shared/ipc/)
  → Tauri Command (input adapter in src-tauri/src/features/<feature>/commands.rs)
  → Rust Use Case / Service (src-tauri/src/features/<feature>/service.rs)
  → Integration Port (trait in ports.rs, only when crossing an external boundary)
  → Concrete Adapter (HTTP / Process / Sidecar / Filesystem in adapters/)
```

---

## 2. Atomic Design for All UI Components

- **NEVER**: Build monolithic components that mix primitive UI rendering, multi-control composition, and feature/IPC orchestration.
- **NEVER**: Call IPC clients, feature hooks, or global stores inside **Atoms** or **Molecules**.
- **ALWAYS**: Classify and structure every UI component in `src/shared/ui/` (reused across 2+ features) and `src/features/<feature>/ui/` (feature-scoped) using the mandatory **Atom → Molecule → Organism** hierarchy:

| Level                       | Responsibility                                                                                                                    | Allowed State & Dependencies                                           | Forbidden                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Atom** (`atoms/`)         | Smallest indivisible visual primitive (`Button`, `Badge`, `Icon`, `StatusDot`, `FileChip`, `Input`)                               | Props only; internal visual states (hover/focus/disabled)              | Hooks with side effects, IPC calls, stores, domain types, outer margins (`margin`, `top`, `left`) |
| **Molecule** (`molecules/`) | Functional unit combining 2+ atoms (`Popover`, `Dialog`, `FormField`, `HookRow`, `ToolActivityRow`, `ContextBar`)                 | Ephemeral UI state (`useState`, `useRef`); props down, events up       | IPC calls, feature/app stores, domain orchestration, outer layout positioning                     |
| **Organism** (`organisms/`) | Self-contained interface section (`Composer`, `ProviderPicker`, `ConversationView`, `RightPanel`, `DiffView`, `HooksReviewModal`) | Feature hooks, segmented UI stores, composition of molecules and atoms | Raw `invoke()` calls (must go through feature hooks + typed IPC clients)                          |

**Import direction rule**: `Organism → Molecule → Atom`. Lower levels must never import from higher levels.

---

## 3. Zero Raw `invoke()` or `listen()` in Components

- **NEVER**: Import `invoke` from `@tauri-apps/api/core` or `listen`/`Channel` from `@tauri-apps/api/event` directly inside React components (`atoms`, `molecules`, or `organisms`).
- **ALWAYS**: Encapsulate every Tauri command and `Channel`/event subscription inside `src/features/<feature>/api/<feature>-client.ts` backed by `src/shared/ipc/client.ts`, and consume it through a feature hook in `src/features/<feature>/hooks/`.

```ts
// ❌ FORBIDDEN in UI components
import { invoke } from '@tauri-apps/api/core';
const providers = await invoke('list_providers');

// ✅ CORRECT: Typed IPC client + feature hook
// src/features/providers/api/provider-client.ts
import { ipcInvoke } from '@/shared/ipc/client';
import type { ProviderDto } from './provider.contracts';

export function listProviders(): Promise<ProviderDto[]> {
  return ipcInvoke<ProviderDto[]>('list_providers');
}
```

---

## 4. Intent-Driven Commands (No Universal Execution Gateways)

- **NEVER**: Expose generic commands such as `execute(action, payload)`, `run_shell(command)`, or `eval_command(raw)` that concentrate authority and bypass specific contracts.
- **ALWAYS**: Define narrow, intent-driven Tauri commands in `snake_case` (`list_providers`, `create_project`, `start_run`, `cancel_run`) with dedicated request/response DTOs.
- **ALWAYS**: Keep `src-tauri/src/lib.rs` exclusively for composition, state registration, and `tauri::generate_handler![]`. `src-tauri/src/main.rs` remains a minimal entrypoint.

---

## 5. Three Distinct Representations (DTO ≠ Domain ≠ Provider Payload)

- **NEVER**: Reuse the same struct/type simultaneously as a Tauri IPC DTO, internal domain entity, and external provider HTTP/CLI payload.
- **NEVER**: Expose internal credentials, API keys, filesystem storage paths, or raw provider errors in IPC DTOs.
- **ALWAYS**: Annotate Rust IPC DTOs with `#[serde(rename_all = "camelCase")]` (and `deny_unknown_fields` on strict request inputs) so JSON crosses the boundary in `camelCase` while Rust fields remain `snake_case`.
- **ALWAYS**: Normalize errors crossing IPC into a serializable `AppErrorDto` containing stable `snake_case` error codes (`validation_failed`, `permission_denied`, `provider_unavailable`, `cancelled`, `internal_error`), `message`, `retryable`, and `requestId`. Never assume a rejected `invoke()` promise is a JS `Error` instance.

---

## 6. Four-Tier Boundary Validation in Rust

Typing in TypeScript (`invoke<RunDto>`) and deserializing in Serde only check shape. Every Tauri command that mutates state, accesses the filesystem, or triggers a run MUST validate:

1. **Shape**: Serde types, closed enums / discriminated unions, required fields.
2. **Limits**: Prompt byte length, collection bounds, buffer sizes, and timeouts.
3. **Invariants**: Model belongs to selected provider (`provider -> model -> effort`), run state allows transition.
4. **Authority**: Target path belongs to an authorized workspace root (canonicalized parent validation against `..`, symlinks, and platform path quirks), and tool/hook execution satisfies the core approval policy.

---

## 7. Security, Secrets, Capabilities, and Approval Policy

- **NEVER**: Store API keys or provider credentials in React state, frontend bundles, `VITE_*` env vars, DTO responses, or unredacted logs.
- **NEVER**: Trust UI flags like `approved: true` or hidden buttons as authorization. Tool approval modes (`ask always`, `auto-approve`, `full access`) and executable hook policies (`PreToolUse`, timeouts, allowed working directories) MUST be enforced in the Rust local core.
- **NEVER**: Concatenate user or model input into a shell command string when spawning external processes or sidecars; always pass executable ID, argument arrays, explicit authorized `cwd`, minimal environment, and timeout.
- **NEVER**: Assume `capabilities/default.json` restricts custom `#[tauri::command]` functions automatically, or that `std::fs` / Rust HTTP clients inherit plugin scopes. Register sensitive application commands in `build.rs` (`tauri_build::AppManifest::commands`) with explicit permissions and enforce path/destination policies in the Rust adapter.
- **ALWAYS**: Treat LLM/agent outputs and tool-call requests as untrusted input. Sanitize rendered Markdown/HTML and define an explicit CSP in `tauri.conf.json` before loading external resources.

---

## 8. Single Authority per State & Concurrency Discipline

- **NEVER**: Mirror the entire backend database or conversation history in a single global frontend store (`useAppStore`, `useGlobalStore`).
- **NEVER**: Hold a synchronous `MutexGuard` across an `.await` point in Rust/Tokio. Copy or extract needed data, drop the guard, perform async I/O, and reconcile under a short lock.
- **ALWAYS**: Respect state ownership:
  - **React**: Ephemeral presentation state (open popovers/panels, unsent composer draft, active tab). Use segmented stores per single UI capability if shared across organisms.
  - **Rust Local Core**: Active runs (`runId -> state/handle/cancellation`), provider registry, credentials, workspace authority, and persistence.
- **ALWAYS**: Use Tauri `Channel` (not global events) for high-frequency incremental run streaming (`started`, `textDelta`, `toolActivity`, and terminal `completed | failed | cancelled` tagged with `runId` and sequence number). Register receivers before emitting, and clean up listeners idempotently (`unlisten`) on unmount.
- **ALWAYS**: Reconcile the `provider -> model -> effort` selection chain when switching providers, and discard stale async responses from previous selections.

---

## 9. Naming, Language, and No-Hardcoding Discipline

- **NEVER**: Write source-code identifiers (variables, functions, types, traits, structs, modules, filenames) in Spanish. All code identifiers in TypeScript and Rust MUST be 100% English.
- **NEVER**: Hardcode wireframe placeholder strings (`"ChatGPT"`, `"GPT-6.1 Sol"`, `"Codex"`, example project names) or raw UI copy in JSX. Providers, models, and projects come from abstractions; all UI copy goes through `i18n` / message maps.
- **NEVER**: Create a generic `utils/` dumping ground. Name shared modules by concrete responsibility (`path_policy`, `error_mapping`, `run_supervisor`).
- **ALWAYS**: Use **named exports** in TypeScript/React (except framework entrypoints that strictly require default export).

---

## Verification Checklist for Agents

- [ ] Does the feature respect the `UI Organism → Hook → IPC Client → Tauri Command → Service → Port → Adapter` boundary?
- [ ] Are UI components classified into `atoms/`, `molecules/`, and `organisms/` with zero IPC/store access in atoms and molecules?
- [ ] Are DTOs separated from domain models and annotated with `#[serde(rename_all = "camelCase")]`?
- [ ] Does the Rust command validate Shape, Limits, Invariants, and Authority?
- [ ] Are `MutexGuard`s dropped before `.await` and is `cancel_run` propagated to the underlying adapter/process?
- [ ] Are all identifiers in English and all UI texts routed through i18n/messages without wireframe placeholders?
