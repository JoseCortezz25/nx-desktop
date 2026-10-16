---
name: naming-language
description: 'Trigger: identifier language, Spanish variable, naming convention, rename symbol. Enforce 100% English source-code identifiers in TS and Rust.'
license: Apache-2.0
metadata:
  author: 'JoseCortezz25'
  version: '1.0'
---

## Activation Contract

Load this skill when:

- Naming or reviewing variables, functions, types, interfaces, structs, enums, traits, hooks, Tauri commands, or files in `src/` and `src-tauri/`.
- Translating Spanish wireframe terms or domain concepts into code identifiers.

## Hard Rules

- Every source-code identifier and file name in TypeScript and Rust MUST be written in English—zero exceptions for domain terms.
- Wireframe Spanish terms must map to canonical English identifiers:
  - `Proveedor` → `Provider` / `providerId`
  - `Modelo` → `Model` / `modelId`
  - `Esfuerzo` → `Effort` / `effortLevel`
  - `Modo de aprobación` → `ApprovalMode` / `approvalMode`
  - `Proyecto` → `Project` / `projectId`
  - `Conversación` → `Conversation` / `conversationId`
  - `Ejecución` → `Run` / `runId`
  - `Entorno local` → `RunEnvironment` / `runEnvironment`
- String literals used as logic discriminants, error codes, or event names must be English (`provider_unavailable`, `run-completed`).
- User-facing UI text belongs exclusively in `messages.ts` / `src/shared/i18n/messages.ts`.

## Decision Gates

| Artifact Type                                               | Language Requirement                                              |
| ----------------------------------------------------------- | ----------------------------------------------------------------- |
| TS/Rust variables, functions, types, structs, traits, files | **100% English** (`kebab-case` files in TS, `snake_case` in Rust) |
| Error codes, enum tags, IPC event names                     | **100% English** (`snake_case` / `kebab-case`)                    |
| User-facing UI copy                                         | Externalized in `messages.ts` / `i18n` (locale-dependent)         |

## Execution Steps

1. Scan new or modified identifiers across `.ts`, `.tsx`, and `.rs` files for non-English words.
2. Replace any Spanish or mixed-language identifier with its canonical English domain term from `.claude/knowledge/business-logic.md`.
3. Move any inline Spanish UI label into the corresponding `messages.ts` file.

## Output Contract

Return:

- Code with 100% English identifiers and file names, aligned with `.claude/rules/naming-conventions.md` and `.claude/rules/naming-language.md`.

## References

- `../../.claude/rules/naming-language.md` — Forbidden Spanish words and English replacements.
- `../../.claude/rules/naming-conventions.md` — Casing and suffix rules across TypeScript and Rust.
