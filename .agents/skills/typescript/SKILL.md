---
name: typescript
description: 'Trigger: TypeScript, types, interfaces, discriminated union, generics, type guard, contracts. Write strict TypeScript without any.'
license: Apache-2.0
metadata:
  author: 'JoseCortezz25'
  version: '1.0'
---

## Activation Contract

Load this skill when:

- Defining TypeScript types, interfaces, DTO contracts (`*.contracts.ts`), or type guards in `src/`.
- Modeling discriminated unions for Tauri IPC streams, errors, or domain states.

## Hard Rules

- Never use `any` (`@typescript-eslint/no-explicit-any: error`). Use `unknown` with narrowing type guards when validating untrusted or catch-block values.
- Prefer `as const` objects with derived types (`(typeof OBJ)[keyof typeof OBJ]`) when constants are needed at both runtime and type level.
- Use explicit discriminated unions (keyed by a discriminant such as `kind` or `status`) for variable IPC payloads and stream events to guarantee exhaustive `switch` checks.
- Keep interfaces flat (one level of nesting); extract nested shapes into dedicated named types/interfaces.
- Always use `import type { ... }` for type-only imports.
- Do not prefix interfaces with `I` (`IUser`) or stack suffixes (`ProviderResponseDtoModel`).

## Decision Gates

| Scenario                                           | Pattern                                                                          |
| -------------------------------------------------- | -------------------------------------------------------------------------------- |
| Fixed set of status/error codes used in logic & UI | `as const` object + derived union type                                           |
| Stream frame or IPC message with variant payloads  | Discriminated union (`type RunStreamEventDto = { kind: 'started'; ... } \| ...`) |
| Component props definition                         | `interface {ComponentName}Props`                                                 |
| Catch block or raw IPC rejection normalization     | `unknown` narrowed via custom type guard (`isAppErrorDto(err)`)                  |

## Execution Steps

1. Place feature-specific domain types in `src/features/<feature>/model/<feature>.types.ts` and IPC wire contracts in `src/features/<feature>/api/<feature>.contracts.ts`.
2. Ensure all DTO fields use `camelCase` matching Rust's `#[serde(rename_all = "camelCase")]`.
3. Write an exhaustive `switch` helper (`assertNever`) when handling discriminated union variants.
4. Run `pnpm run typecheck` and `pnpm run lint` to verify zero errors.

## Output Contract

Return:

- Type definitions with flat structure, `import type`, and zero `any`.
- Passing `pnpm run typecheck` verification.

## References

- `../../.claude/rules/code-quality.md` — TypeScript strictness and ESLint rules.
- `../../.claude/rules/ipc-and-contracts.md` — DTO and discriminated union rules.
