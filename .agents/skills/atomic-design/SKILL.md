---
name: atomic-design
description: 'Trigger: UI component, atom, molecule, organism, componentize, split component. Classify and build decoupled UI components using Atomic Design.'
license: Apache-2.0
metadata:
  author: 'JoseCortezz25'
  version: '1.0'
---

## Activation Contract

Load this skill when:

- Creating a new React UI component in `src/shared/ui/` or `src/features/<feature>/ui/`.
- Splitting a monolithic component or translating wireframes (`docs/wireframes/*.html`) into React components.
- Refactoring component responsibilities, props, or imports across UI layers.

## Hard Rules

- Every UI component MUST be placed in `atoms/`, `molecules/`, or `organisms/`.
- **Atoms** (`atoms/`): Purely presentational, controlled via props, zero feature hooks, zero IPC calls, zero store imports, no outer `margin`/`top`/`left`.
- **Molecules** (`molecules/`): Compose 2+ atoms for one UI task; may hold local UI state (`useState`, `useRef`); zero IPC calls, zero store access, props down and events up.
- **Organisms** (`organisms/`): Self-contained product sections (`Composer`, `ProviderPicker`, `RightPanel`, `DiffView`); connect feature hooks and segmented UI stores to molecules and atoms; never call raw `invoke()` directly.
- Import direction is strictly top-down: `Organism → Molecule → Atom`. Shared components (`src/shared/ui/**`) must never import from `src/features/**`.
- Use named exports (`export function ComponentName`) and `kebab-case.tsx` filenames.

## Decision Gates

| Question                                                                                                                           | Classification | Target Path                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------- |
| Single indivisible primitive (`Button`, `Badge`, `Icon`, `FileChip`, `StatusDot`)?                                                 | **Atom**       | `src/shared/ui/atoms/` or `src/features/<f>/ui/atoms/`                |
| Combines 2+ atoms for one UI task without IPC or store access (`Popover`, `Dialog`, `HookRow`, `ToolActivityRow`, `ContextBar`)?   | **Molecule**   | `src/shared/ui/molecules/` or `src/features/<f>/ui/molecules/`        |
| Complete product section coordinating feature hooks/stores (`Composer`, `ConversationView`, `ProviderPicker`, `HooksReviewModal`)? | **Organism**   | `src/features/<f>/ui/organisms/` or `src/shared/ui/organisms/`        |
| Used by 2+ features vs 1 feature?                                                                                                  | **Scope**      | `2+` → `src/shared/ui/<level>/`; `1` → `src/features/<f>/ui/<level>/` |

## Execution Steps

1. Inspect the wireframe or component requirement and decompose it bottom-up (`Atom → Molecule → Organism`).
2. Check `src/shared/ui/` first to reuse existing atoms and molecules (such as the shared `Popover` list or `Dialog` shell).
3. Define `{ComponentName}Props` with `on*` callback props and `handle*` internal handlers.
4. Externalize all user-facing strings to `messages.ts` or `src/shared/i18n/messages.ts`.
5. Verify no Atom or Molecule imports from `api/`, `hooks/`, `stores/`, or higher atomic levels.

## Output Contract

Return:

- Component classification table (`Component`, `Atomic Level`, `Scope`, `File Path`).
- Created or updated component files using named exports and English identifiers.
- Verification that import direction and prop boundaries are respected.

## References

- `references/folder-patterns.md` — Hybrid Feature + Atomic Design directory patterns and import rules.
- `references/classification-examples.md` — Component classification catalog across UI categories.
- `../../.claude/rules/atomic-design.md` — Project-enforced Atomic Design rule.
