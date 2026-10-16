---
paths: src/**/*.{ts,tsx}, src-tauri/**/*.rs
---

# Folder Structure & Modular Organization

`nx-desktop` follows a **Modular Monolith by Feature** on both frontend (`src/features/`) and Rust local core (`src-tauri/src/features/`), combined with **Atomic Design** (`atoms/`, `molecules/`, `organisms/`) for all UI components.

---

## 1. Where Every File Belongs

| Responsibility                      | Frontend Location (`src/`)                                     | Rust Location (`src-tauri/src/`)                        |
| ----------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------- |
| **App composition & shell**         | `src/app/app-shell.tsx`, `src/app/providers.tsx`               | `src-tauri/src/lib.rs`, `src-tauri/src/app_state.rs`    |
| **Feature UI (Atomic Design)**      | `src/features/<feature>/ui/{atoms,molecules,organisms}/`       | N/A                                                     |
| **Shared UI (2+ features)**         | `src/shared/ui/{atoms,molecules,organisms,layout}/`            | N/A                                                     |
| **Feature hooks**                   | `src/features/<feature>/hooks/use-*.ts`                        | N/A                                                     |
| **Feature UI stores**               | `src/features/<feature>/stores/*.store.ts`                     | N/A                                                     |
| **IPC client & contracts**          | `src/features/<feature>/api/*-client.ts`, `src/shared/ipc/`    | `src-tauri/src/features/<feature>/{commands.rs,dto.rs}` |
| **Use cases / application logic**   | Coordinated in feature hooks calling IPC                       | `src-tauri/src/features/<feature>/service.rs`           |
| **Domain entities & invariants**    | `src/features/<feature>/model/*.types.ts` (presentation model) | `src-tauri/src/features/<feature>/domain.rs`            |
| **External integration ports**      | N/A                                                            | `src-tauri/src/features/<feature>/ports.rs`             |
| **External adapters (HTTP/CLI/FS)** | N/A                                                            | `src-tauri/src/features/<feature>/adapters/*.rs`        |
| **Cross-cutting IPC error mapping** | `src/shared/ipc/client.ts`                                     | `src-tauri/src/ipc/error.rs`                            |
| **Security & path policies**        | N/A                                                            | `src-tauri/src/security/path_policy.rs`                 |

---

## 2. Structural Guardrails

1. **Incremental Creation**: Create feature folders and files only when implementing a concrete vertical slice. Never create empty placeholder directories (`ports.rs`, `adapters/`, `stores/`) until a feature requires them.
2. **No Cross-Feature Internal Imports**: A feature in `src/features/A` must not reach into internal files of `src/features/B`. Shared primitives used by 2+ features move to `src/shared/`.
3. **No Generic `utils/` Folder**: Name shared helper modules after their concrete responsibility (`path_policy.rs`, `error_mapping.rs`, `format-duration.ts`).
4. **Consistent Rust Module Style**: Use `mod.rs` inside feature directories (`src-tauri/src/features/<feature>/mod.rs`) consistently; do not mix `foo.rs` + `foo/` and `foo/mod.rs` styles in the same tree.
