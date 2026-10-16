---
name: tauri-ipc-command
description: 'Trigger: Tauri command, invoke, IPC contract, DTO, Channel stream, start_run. Create end-to-end typed Tauri 2 IPC commands and frontend clients.'
license: Apache-2.0
metadata:
  author: 'JoseCortezz25'
  version: '1.0'
---

## Activation Contract

Load this skill when:

- Adding or modifying a `#[tauri::command]` in `src-tauri/src/features/<feature>/commands.rs`.
- Defining IPC Request/Response DTOs or `Channel` streaming contracts between Rust and TypeScript.
- Creating or updating a frontend IPC client in `src/features/<feature>/api/<feature>-client.ts`.

## Hard Rules

- Never call `@tauri-apps/api/core` `invoke` directly inside React components; encapsulate every call in `src/features/<feature>/api/<feature>-client.ts` via `src/shared/ipc/client.ts`.
- Commands must be intent-specific in `snake_case` (`list_providers`, `start_run`, `cancel_run`). Never create generic `execute(action, payload)` or `run_shell(cmd)` gateways.
- Separate IPC DTOs (`dto.rs`) from domain entities (`domain.rs`) and external provider payloads (`adapters/`).
- Annotate Rust DTOs with `#[serde(rename_all = "camelCase")]` (and `deny_unknown_fields` on strict request structs).
- Every command must validate **Shape**, **Limits**, **Invariants**, and **Authority**, and return `Result<TDto, AppErrorDto>`.
- Use `tauri::ipc::Channel` (not global events) for incremental run streaming (`runId`, `seq`, and terminal state `completed | failed | cancelled`).

## Decision Gates

| Communication Pattern               | Mechanism                         | Contract Requirement                                                                                                |
| ----------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Request / Response operation        | `#[tauri::command]` + `invoke<T>` | `RequestDto` (`camelCase`), `ResponseDto`, `AppErrorDto`                                                            |
| Incremental run output / progress   | `tauri::ipc::Channel<StreamDto>`  | Discriminated union with `runId`, `seq`, `started \| textDelta \| toolActivity \| completed \| failed \| cancelled` |
| Multi-window broadcast notification | Targeted/Global Tauri Event       | `kebab-case` event name, payload DTO, idempotent `unlisten` cleanup                                                 |

## Execution Steps

1. Define the Rust Request/Response DTOs in `src-tauri/src/features/<feature>/dto.rs` with `#[serde(rename_all = "camelCase")]`.
2. Implement the use case in `service.rs` enforcing limits, domain invariants, and workspace/approval authority.
3. Expose the thin `#[tauri::command]` in `commands.rs`, mapping internal errors to `AppErrorDto` with `request_id`.
4. Register the command in `src-tauri/src/lib.rs` (`tauri::generate_handler![]`) and in `build.rs` / `permissions/` if it requires explicit ACL scoping.
5. Create matching TypeScript contracts and client functions in `src/features/<feature>/api/` using `src/shared/ipc/client.ts` to normalize `unknown` rejections.
6. Add a Rust serialization test verifying the exact `camelCase` JSON wire format for success and error payloads.

## Output Contract

Return:

- Rust DTO, command, and service files created or updated.
- Frontend contract and IPC client files created or updated.
- Serialization test verifying `camelCase` JSON compatibility between Rust Serde and TypeScript.

## References

- `../../docs/research-tecnico/arquitectura-tauri.md` — Sections 4 (Connections & Protocols) and 5 (DTO & Contracts).
- `../../.claude/rules/ipc-and-contracts.md` — Normative IPC and DTO contract rules.
