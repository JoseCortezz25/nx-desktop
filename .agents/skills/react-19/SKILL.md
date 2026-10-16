---
name: react-19
description: 'Trigger: React 19, component, hook, useEffect, unlisten, Zustand store, provider selection. Apply React 19 and Tauri frontend state patterns.'
license: Apache-2.0
metadata:
  author: 'JoseCortezz25'
  version: '1.0'
---

## Activation Contract

Load this skill when:

- Writing or refactoring React 19 components, feature hooks (`use-*.ts`), or segmented UI stores (`*.store.ts`) in `src/`.
- Subscribing to Tauri `Channel` streams or application events from React.
- Implementing composer selection chains (`provider -> model -> effort`) or concurrent async UI flows.

## Hard Rules

- Use named imports (`import { useState, useEffect } from 'react'`) and named component exports (`export function Component()`).
- Pass `ref` directly as a standard prop in React 19; never use `forwardRef`.
- Do not add manual `useMemo` or `useCallback` unless profiling proves a specific referential stability requirement for an external subscription.
- Trigger IPC commands from event handlers (`handle*`), not `useEffect`. Reserve `useEffect` exclusively for synchronizing with external systems (IPC event/channel listeners, DOM observers) and compute derived state during render.
- Every async listener registration inside `useEffect` MUST clean up idempotently on unmount, handling the race where `listen()` resolves after the component has already unmounted.
- Keep only ephemeral presentation state in React/Zustand (`sidebar.store.ts`, `right-panel.store.ts`). Universal stores (`useAppStore`, `useGlobalStore`) are forbidden.

## Decision Gates

| State Type                                                          | Where It Belongs                                                          |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Active runs, credentials, workspace authority, conversation history | Rust local core (queried via IPC client + feature hook)                   |
| Ephemeral UI state shared across 2+ organisms (e.g., sidebar open)  | Segmented Zustand store (`src/features/<f>/stores/<capability>.store.ts`) |
| Single-component or molecule UI state (popover open, input draft)   | Local `useState` / `useRef`                                               |
| Value computable from existing props/state                          | Derived inline during render (never `useEffect` + `setState`)             |

## Execution Steps

1. Place business/IPC orchestration inside a feature hook (`src/features/<feature>/hooks/use-*.ts`).
2. When switching `providerId`, synchronously reset `modelId` and `effortLevel` to valid catalog defaults and ignore stale async responses from prior selections.
3. For Tauri event/stream subscriptions, implement an `isCancelled` guard inside `useEffect` so late-resolving `unlisten` functions are invoked immediately if unmounted.
4. Keep components purely presentational per their Atomic Design level (`Atom`, `Molecule`, `Organism`).

## Output Contract

Return:

- Updated/created `.tsx` or `.ts` files with named exports and zero raw `invoke()` calls in components.
- Confirmation of idempotent subscription cleanup and state ownership boundaries.

## References

- `../../docs/research-tecnico/arquitectura-tauri.md` — Section 7 (State, Concurrency, and Lifecycle).
- `../../.claude/rules/state-and-concurrency.md` — Frontend concurrency and state rules.
