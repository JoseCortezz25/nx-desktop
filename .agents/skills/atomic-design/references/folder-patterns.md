# Folder Patterns & Atomic Design in `nx-desktop`

`nx-desktop` combines a **Modular Monolith by Feature** (`src/features/<feature>/`) with **Atomic Design** (`atoms/`, `molecules/`, `organisms/`).

---

## 1. Two-Tier Atomic Placement

```text
src/
├── shared/
│   └── ui/                         # Reused across 2+ features
│       ├── atoms/                  # button.tsx, badge.tsx, icon.tsx, file-chip.tsx
│       ├── molecules/              # popover.tsx, dialog.tsx, context-bar.tsx, message-actions.tsx
│       ├── organisms/              # right-panel.tsx, sidebar.tsx, title-bar.tsx
│       └── layout/                 # window-shell.tsx
└── features/
    ├── providers/
    │   └── ui/
    │       ├── atoms/
    │       ├── molecules/
    │       └── organisms/          # provider-picker.tsx, model-picker.tsx, effort-picker.tsx
    ├── conversations/
    │   └── ui/
    │       ├── atoms/
    │       ├── molecules/
    │       └── organisms/          # composer.tsx, conversation-view.tsx
    └── runs/
        └── ui/
            ├── atoms/
            ├── molecules/          # tool-activity-row.tsx, hook-row.tsx
            └── organisms/          # run-status.tsx, hooks-review-modal.tsx, diff-view.tsx
```

---

## 2. Import Direction Contract

```text
AppShell / View → may import Feature Organisms, Shared Organisms, Molecules, Atoms
Organism        → may import Feature Hooks, Feature/Shared Molecules, Feature/Shared Atoms
Molecule        → may import Feature/Shared Atoms (NEVER Organisms, Hooks, Stores, or IPC)
Atom            → may import only design tokens / icons (NEVER Molecules, Organisms, Hooks, or IPC)
```
