---
paths: src/**/*.{ts,tsx}, src-tauri/**/*.rs
---

# IPC Protocols, DTOs & Contract Rules

All communication between the React webview and the Rust local core crosses a trust and serialization boundary.

---

## 1. Three Separate Representations

Never collapse these three models into one shared struct:

1. **IPC DTO (`dto.rs` / `*.contracts.ts`)**: What crosses the Tauri boundary (`StartRunRequest`, `RunDto`, `AppErrorDto`).
2. **Domain Model (`domain.rs`)**: Internal product entities and value objects (`Run`, `ProviderId`, `ModelId`, `WorkspacePath`).
3. **Adapter Wire Format (`adapters/*.rs`)**: Vendor-specific payloads for OpenCode, Codex, or Claude.

---

## 2. Serde & TypeScript Contract Alignment

- Annotate every Rust DTO with `#[serde(rename_all = "camelCase")]`.
- Use `deny_unknown_fields` on strict command input structs when rejecting unexpected fields is desired.
- Use closed enums or explicitly tagged discriminated unions (`#[serde(tag = "kind", rename_all = "camelCase")]`) for variable payloads such as stream frames.
- Add serialization fixture tests in Rust (`serde_json::to_value` / `from_value`) whenever introducing or changing an IPC DTO so `run_id` vs `runId` mismatches fail deterministically at test time.

---

## 3. Four-Level Boundary Validation

Every Tauri command in `commands.rs` + `service.rs` must enforce:

1. **Shape**: Validated by Serde deserialization.
2. **Limits**: Non-empty IDs, max prompt byte length (`MAX_PROMPT_BYTES`), bounded arrays, and timeouts.
3. **Invariants**: Selected `modelId` belongs to `providerId`; run state allows the requested transition.
4. **Authority**: Target folder belongs to an authorized project workspace; tool/hook action satisfies the core approval policy.

---

## 4. Public Error Contract (`AppErrorDto`)

- Commands return `Result<T, AppErrorDto>`.
- `AppErrorDto` carries:
  - `code`: stable `snake_case` identifier (`validation_failed`, `permission_denied`, `provider_unavailable`, `cancelled`, `internal_error`)
  - `message`: safe diagnostic summary (never raw secrets or stack traces)
  - `retryable`: boolean
  - `request_id`: correlation ID logged in Rust
- In TypeScript, `src/shared/ipc/client.ts` normalizes `unknown` promise rejections into `AppErrorDto` before hooks or UI components consume them.

---

## 5. Streaming via `Channel` vs Events

- Use `tauri::ipc::Channel` for run output streams (`started`, `textDelta`, `toolActivity`, and terminal `completed | failed | cancelled`).
- Include `runId` and monotonic `seq` in every stream message.
- Register the frontend `Channel` handler before invoking the command.
- Do not use global events as high-throughput data streams or unvalidated command substitutes.
