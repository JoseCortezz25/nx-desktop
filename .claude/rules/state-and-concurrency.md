---
paths: src/**/*.{ts,tsx}, src-tauri/**/*.rs
---

# State Management, Concurrency & Lifecycle

Each piece of state in `nx-desktop` has exactly **one authoritative owner**.

---

## 1. State Ownership Matrix

| State Category                                    | Authoritative Owner        | Where It Lives                                      | Rules                                                                                                                           |
| ------------------------------------------------- | -------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Active Runs, Credentials, Workspace Authority** | Rust Local Core            | `src-tauri/src/app_state.rs` & `runs/supervisor.rs` | Single source of truth; queried via IPC snapshot on view mount/reopen                                                           |
| **Persisted History (Projects, Conversations)**   | Rust Local Core            | Rust persistence adapter                            | Never mirror the entire database into a global frontend store                                                                   |
| **Shared Ephemeral UI State**                     | Segmented UI Store         | `src/features/<feature>/stores/*.store.ts`          | One store per single UI capability (`sidebar.store.ts`, `right-panel.store.ts`); universal stores (`useAppStore`) are forbidden |
| **Local Component UI State**                      | React Component / Molecule | `useState` / `useRef`                               | Input draft, popover open state, hovered item                                                                                   |

---

## 2. Frontend Concurrency & Subscription Hygiene

1. **Selection Chain Reconciliation**: When `providerId` changes in the composer, immediately reset `modelId` and `effortLevel` to valid values for the new provider.
2. **Stale Response Rejection**: Tag concurrent async requests with the originating selection/request token and discard responses that arrive after the user changed selection.
3. **Idempotent Listener Cleanup**: Every `listen()` or `Channel` subscription must have a clear owner and call `unlisten()` on unmount. Handle the async registration race: if the component unmounts before `listen()` resolves, immediately call the returned `unlisten` function upon resolution.
4. **Minimal `useEffect`**: Trigger IPC actions from user event handlers (`handle*`). Reserve `useEffect` for external subscription synchronization and cleanup; compute derived values during render.

---

## 3. Rust Concurrency & Cancellation (`Tokio` + `Tauri`)

1. **Never Hold a `MutexGuard` Across `.await`**: Extract or clone the required state under a short lock, drop the guard, execute network/disk/process `.await`, and re-acquire a short lock to reconcile state.
2. **Avoid a Single Global Mutex**: Partition managed state by responsibility (`ProviderRegistry`, `RunSupervisor`) rather than serializing the entire app behind one lock.
3. **Separate CPU/Blocking Work from Async Tasks**: Do not run blocking filesystem or CPU-heavy parsing directly on the main thread or cooperative async worker without an appropriate blocking pool.
4. **End-to-End Cancellation (`cancel_run`)**:
   - Dropping a frontend Promise does NOT cancel a Rust task or child process.
   - `cancel_run(run_id)` must be idempotent, verify caller authority, signal the adapter/process cancellation token, terminate child process trees cleanly, and resolve the race between completion and cancellation into a single terminal state (`completed | failed | cancelled`).
