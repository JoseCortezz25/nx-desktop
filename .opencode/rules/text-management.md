---
paths: src/**/*.{ts,tsx}
---

# Text Management & Internationalization (i18n)

All user-facing text in `nx-desktop` must be externalized to support internationalization (`i18n`) and prevent hardcoded strings or wireframe placeholders in components.

---

## 1. Zero Hardcoded UI Copy or Wireframe Placeholders

- **NEVER** hardcode UI labels, button text, empty states, or error descriptions directly inside JSX.
- **NEVER** hardcode placeholder strings from the wireframes (`"ChatGPT"`, `"GPT-6.1 Sol"`, `"Codex"`, `"Nuevo proyecto"`, sample model names, or sample project paths) as production constants. Provider, model, and project names must come from runtime abstractions.

---

## 2. Message Organization by Scope

### Shared Cross-Feature Messages (`src/shared/i18n/messages.ts`)

Contains generic reusable actions, common statuses, the app's own chrome labels (for example the rail's home entry and its two region toggles), and public IPC error code translations (`validation_failed`, `permission_denied`, `provider_unavailable`, `cancelled`, `internal_error`).

The OS window frame, its minimize/maximize/close controls and the application menu are **not** frontend copy. Their labels belong to the native menu declaration in Rust (`src-tauri/src/lib.rs`, `Menu::default`), and the drawn bar's four fake menu labels (`Archivo`, `Edición`, `Ver`, `Ayuda`) were removed from this map with the drawn bar (#42).

```ts
// src/shared/i18n/messages.ts
export const sharedMessages = {
  actions: {
    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
    retry: 'Retry'
  },
  errors: {
    validation_failed: 'The request contains invalid parameters.',
    permission_denied:
      'Operation not permitted outside the authorized workspace.',
    provider_unavailable:
      'The selected agent provider is currently unavailable.',
    cancelled: 'The run was cancelled.',
    internal_error: 'An unexpected internal error occurred.'
  }
} as const;
```

The module also exposes typed accessors. Read copy through them instead of
indexing the literal directly:

```ts
import {
  getSharedErrorMessage,
  getSharedMessages
} from '@/shared/i18n/messages';

getSharedMessages().actions.save; // 'Save'
getSharedErrorMessage('provider_unavailable');
// 'The selected agent provider is currently unavailable.'
```

`getSharedErrorMessage` is keyed by the public `snake_case` error codes emitted by
the Rust `AppErrorDto` (`validation_failed`, `permission_denied`,
`provider_unavailable`, `cancelled`, `internal_error`).

### Feature Messages (`src/features/<feature>/messages.ts`)

Each feature module encapsulates its own copy in `src/features/<feature>/messages.ts` with `as const` and functions for dynamic interpolation (never string concatenation in JSX):

```ts
// src/features/runs/messages.ts
export const runMessages = {
  status: {
    started: 'Running...',
    completed: 'Completed',
    failed: 'Failed',
    cancelled: 'Cancelled'
  },
  diffSummary: (added: number, removed: number) => `+${added} / -${removed}`
} as const;
```
