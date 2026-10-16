---
paths: src/**/*.{ts,tsx}
---

# Atomic Design Componentization Rules

All UI components in `nx-desktop` MUST be classified, structured, and decoupled using **Atomic Design**.

---

## 1. Mandatory Hierarchy: Atom → Molecule → Organism

We use a hybrid Feature + Atomic Design layout:

- **Shared across 2+ features**: `src/shared/ui/{atoms,molecules,organisms,layout}/`
- **Scoped to 1 feature**: `src/features/<feature>/ui/{atoms,molecules,organisms}/`

| Level        | Folder       | Definition                                                                                                                      | Allowed                                                                                    | Forbidden                                                                                           |
| ------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| **Atom**     | `atoms/`     | Indivisible UI primitive (`Button`, `Badge`, `Icon`, `FileChip`, `StatusDot`, `Input`)                                          | Props, visual variants (`size`, `variant`, `disabled`), internal focus/hover state         | Feature hooks, IPC clients, Zustand stores, business types, outer margins (`margin`, `top`, `left`) |
| **Molecule** | `molecules/` | Composition of 2+ atoms doing one UI job (`Popover`, `Dialog`, `ContextBar`, `ToolActivityRow`, `HookRow`, `MessageActions`)    | Composing atoms, local UI state (`useState`, `useRef`), callbacks (`onSelect`, `onToggle`) | IPC clients, global/feature stores, business rules, outer layout positioning                        |
| **Organism** | `organisms/` | Self-contained product section (`Composer`, `ProviderPicker`, `ConversationView`, `RightPanel`, `DiffView`, `HooksReviewModal`) | Feature hooks (`useConversation`, `useRunStream`), segmented UI stores, molecules & atoms  | Raw `invoke()` or `listen()` calls (must go through feature hooks + typed IPC clients)              |

---

## 2. Strict Import Direction

Components may only import from **equal or lower** Atomic levels:

```text
Organism  → may import Molecule, Atom (from same feature or shared/ui)
Molecule  → may import Atom (never Organism)
Atom      → may import nothing from ui/ (except icon/token primitives)
```

Shared components (`src/shared/ui/**`) MUST NEVER import from `src/features/**`.

---

## 3. Rules for Decoupled Components

1. **Props down, events up**: Atoms and molecules receive data strictly via props and notify parents via `on*` callback props.
2. **No outer margins on Atoms or Molecules**: Never set outer `margin`, `position: absolute`, `top`, or `left` on the root node of an Atom or Molecule. Spacing and placement belong to the parent Organism or layout container.
3. **Reuse one `Popover` / `Select` and one `Dialog` molecule**: Per wireframe rules, `Provider` (screen 16) and `Model` (screens 07, 17, 19, 20) selectors share the same `Popover` list molecule with different data Passed from their respective Feature Organisms.
4. **Named exports only**: Export components using `export function ComponentName({ ... }: ComponentNameProps)` in `kebab-case.tsx` files.
