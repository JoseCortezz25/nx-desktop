---
name: tauri-security-audit
description: 'Trigger: Tauri security, capabilities, permissions, CSP, workspace path, secrets, sidecar, tool approval. Audit and enforce Tauri 2 security boundaries.'
license: Apache-2.0
metadata:
  author: 'JoseCortezz25'
  version: '1.0'
---

## Activation Contract

Load this skill when:

- Modifying `src-tauri/capabilities/`, `src-tauri/permissions/`, `src-tauri/tauri.conf.json`, or `src-tauri/build.rs`.
- Implementing filesystem access, workspace path validation, credential storage, child processes/sidecars, or agent tool/hook execution.
- Auditing security boundaries between the webview, Rust local core, and external providers.

## Hard Rules

- Treat all IPC inputs from the webview and all outputs/tool requests from LLM providers as untrusted data.
- Never store API keys or credentials in React state, frontend bundles, `VITE_*` env vars, DTO responses, or logs.
- Never pass user or model strings into a shell command (`sh -c`); spawn processes with explicit binary identity, argument arrays, validated `cwd`, minimal environment, and timeout.
- Validate all workspace paths in Rust against canonicalized project roots (`path_policy.rs`), rejecting `..`, unauthorized absolute paths, and symlink escapes. For new files, canonicalize the existing parent directory.
- Enforce `ApprovalMode` (`ask_always`, `auto_approve`, `full_access`) and hook policies (`PreToolUse`) in the Rust core—never trust a client-supplied `approved: true` boolean.
- Declare sensitive custom commands in `tauri_build::AppManifest::commands` and scope them in `capabilities/`.

## Decision Gates

| Resource / Action               | Security Mechanism                       | Required Verification                                              |
| ------------------------------- | ---------------------------------------- | ------------------------------------------------------------------ |
| File read/write/diff in project | `WorkspacePath` policy in Rust           | Rejects `..`, symlink escapes, and paths outside authorized roots  |
| Authenticated provider call     | Rust HTTP / Process adapter              | Credentials stay in Rust; redacted from logs and `AppErrorDto`     |
| Custom sensitive Tauri command  | `build.rs` `AppManifest::commands` + ACL | Explicit permission granted only to intended window (`main`)       |
| Agent tool or `PreToolUse` hook | Core approval policy in Rust             | Verified against active `ApprovalMode`, timeout, and allowed `cwd` |

## Execution Steps

1. Identify every trust boundary crossed (Webview → Rust IPC, Rust → OS Filesystem/Process, Provider → Rust/UI).
2. Verify custom commands with side effects are registered in `build.rs` and scoped in `capabilities/default.json`.
3. Audit path handling for canonical parent checks and symlink escape resistance.
4. Confirm secrets and sensitive paths are excluded from DTOs and redacted in logs.
5. Add negative unit/integration tests proving unauthorized paths, unapproved tools, or invalid scopes fail with `permission_denied`.

## Output Contract

Return:

- Security boundary checklist results (`ACL`, `Workspace Path Policy`, `Secrets`, `Process/Tool Approval`, `CSP/Sanitization`).
- Files modified to enforce the policy in Rust.
- Negative test cases proving unauthorized operations are rejected.

## References

- `../../docs/research-tecnico/arquitectura-tauri.md` — Section 6 (Security).
- `../../.claude/rules/security-and-capabilities.md` — Normative security rules.
