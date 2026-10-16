---
paths: src-tauri/**/*, src/**/*.{ts,tsx}
---

# Security, Capabilities & Workspace Authority

In a desktop coding-agent application, both webview IPC inputs and LLM/agent outputs are untrusted across security boundaries.

---

## 1. Custom Commands & Tauri Capabilities (ACL)

- Tauri commands registered in `invoke_handler` are accessible to application windows by default unless declared in `tauri_build::AppManifest::commands`.
- When adding sensitive commands (filesystem writes, process execution, credential management, hook execution), register them in `src-tauri/build.rs` and scope their permissions in `src-tauri/capabilities/` and `src-tauri/permissions/`.
- Remember: `std::fs` and Rust HTTP clients do NOT automatically inherit `tauri-plugin-fs` or `tauri-plugin-http` scopes. Your Rust adapter must enforce the equivalent policy explicitly.

---

## 2. Secrets & Credential Isolation

- **Never** pass API keys, tokens, or secret paths to React state, DTO responses, `VITE_*` variables, or unredacted logs.
- Centralize authenticated provider HTTP/CLI calls inside Rust adapters.
- Redact prompts, credentials, and sensitive paths in logs while preserving `requestId` and `runId` for correlation.

---

## 3. Workspace Path Policy (`path_policy.rs`)

- Represent authorized project folders with an internal validated `WorkspacePath`.
- Validate every file read, write, diff path, or process `cwd` against the authorized workspace root:
  - Reject path traversal (`..`), unauthorized absolute paths, and symlink escapes.
  - When creating a new file (where the final path does not yet exist), canonicalize and verify the existing parent directory and validate the target filename.

---

## 4. Process / Sidecar Execution & Tool Approval

- Never pass user or model input into a shell command string (`sh -c "..."`). Always spawn executables with explicit binary identity, argument array, authorized `cwd`, minimal environment, and timeout.
- Enforce `ApprovalMode` (`ask_always`, `auto_approve`, `full_access`) and executable hook verification (`PreToolUse`, origin, timeout) inside the Rust core—never rely on a disabled UI button or a client-supplied `approved: true` flag alone.
- Sanitize any Markdown or HTML rendered from agent responses, and configure an explicit CSP in `src-tauri/tauri.conf.json` before loading external content.
