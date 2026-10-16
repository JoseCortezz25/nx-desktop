---
paths: src/**/*.{ts,tsx}, src-tauri/**/*.rs
---

# Naming Language — English Only

**All source-code identifiers in TypeScript and Rust MUST be written in English. No exceptions.**

---

## 1. Mandatory Rule

Every identifier in source code—variables, functions, methods, structs, enums, traits, interfaces, types, props, hooks, commands, and file names—must be in English:

```ts
// ❌ Forbidden
const proveedorSeleccionado = getProvider();
function iniciarEjecucion() {}

// ✅ Correct
const selectedProvider = getProvider();
function startRun() {}
```

```rust
// ❌ Forbidden
pub struct IniciarEjecucionRequest {
    pub conversacion_id: String,
}

// ✅ Correct
pub struct StartRunRequest {
    pub conversation_id: String,
}
```

---

## 2. Forbidden Spanish Identifiers

| Forbidden in Code                | Use Instead                            |
| -------------------------------- | -------------------------------------- |
| `proveedor`                      | `provider`                             |
| `modelo`                         | `model`                                |
| `esfuerzo`                       | `effort`                               |
| `proyecto`                       | `project`                              |
| `conversacion`                   | `conversation`                         |
| `ejecucion`                      | `run`                                  |
| `entorno`                        | `environment`                          |
| `modoAprobacion`                 | `approvalMode`                         |
| `datos` / `lista` / `estado`     | `data` / `list` / `state` or `status`  |
| `obtener` / `crear` / `cancelar` | `get` or `fetch` / `create` / `cancel` |

---

## 3. Scope of This Rule

- **Source code identifiers & file names**: 100% English.
- **String literals in logic (status codes, event names, error codes)**: 100% English (`provider_unavailable`, `run-completed`).
- **UI copy / labels**: Externalized in `messages.ts` / `src/shared/i18n/` (where Spanish or other locales are product data, not code identifiers).
- **Technical research docs in `docs/`**: Follow the document's target language.
