# Business Logic & Domain Model

**Essential domain concepts, entity lifecycles, invariants, and open product questions for `nx-desktop`.**
Derived from `docs/wireframes/README.md` and `docs/research-tecnico/arquitectura-tauri.md`.

**Locked product decisions (2026-10-16).** The maintainer answered the nine product questions the wireframes left open (issue #30). They are now locked behaviour, recorded below in the section that owns each one: §2 (`EffortLevel`, `ApprovalMode`, `Project`, `Hook`, `Subagent`, `DiffFile`), §3.1 (mid-conversation provider switch), §3.2 (subagent control), §3.4 (real model names) and §3.5 (diff, message actions, "Abrir"). §4 keeps only what is genuinely still open. Do not silently invent product policy for the rest.

**Locked product decision (2026-10-17, issue #41).** The sidebar header brand is the application name `Nx`, not the active provider; the notifications and search controls are deferred, and the brand chevron is removed. Recorded in §3.6 because it deliberately overrides the wireframe and supersedes the #10 provider brand.

**Locked product decision (2026-10-17, issue #42).** The window chrome is the operating system's: the app keeps the native frame, declares a native application menu in Rust from Tauri's platform defaults, and draws no title bar, menu bar or window controls. Recorded in §3.7 because it deliberately overrides the wireframe's drawn bar and supersedes it.

---

## 1. Product Purpose

`nx-desktop` is a provider-agnostic desktop coding-agent application. Users organize workspaces into **Projects**, run multi-turn coding **Conversations**, switch between coding-agent **Providers** (`OpenCode`, `Codex`, `Claude`) and their **Models**, configure **Effort** and **Approval Mode**, inspect **Tool Activity** and **Hooks** (`PreToolUse`), and review code changes in the **unified** Right Panel (`DocumentView`, `CodeView`, `DiffView`).

---

## 2. Core Domain Abstractions

| Concept              | Identity / Value            | Key Fields & Responsibilities                                                                                                                                                                                                                                                                                                                                                             |
| -------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`Provider`**       | `ProviderId` (Value Object) | `id`, `displayName`, `icon`, `subtitle`, `availableModels`. Represents a coding-agent engine (`opencode`, `codex`, `claude`), which may manage sessions, tools, and multiple models—not just an HTTP chat endpoint. Its models are the provider's real models, sourced from the provider's own configuration—never the example names drawn in the wireframes (decision 2026-10-16, §3.4). |
| **`Model`**          | `ModelId` (Value Object)    | `id`, `displayName`, `providerId`, `supportedEffortLevels`. Scoped strictly to its parent `Provider`.                                                                                                                                                                                                                                                                                     |
| **`EffortLevel`**    | Value Object                | One effort stop exposed by the selected provider/model. There is **no universal ladder**: the provider supplies the stops a model exposes and the count varies between providers and between models (decision 2026-10-16). The concrete per-provider/per-model mapping is still open (§4, research ticket #31).                                                                           |
| **`ApprovalMode`**   | Enum                        | 3 levels: `ask_always` (ask before tool execution), `auto_approve` (approve safe/scoped tools), `full_access` (unrestricted within policy). **Scope: per `Project`** (decision 2026-10-16); enforced in the Rust core, never by UI hiding alone.                                                                                                                                          |
| **`Project`**        | `ProjectId`                 | `id`, `name`, `workspaceFolders` (one or more authorized local source directories), `approvalMode` (project-scoped tool approval policy), `hookDecisions` (project-scoped decision per reviewed hook), `conversations`.                                                                                                                                                                   |
| **`Conversation`**   | `ConversationId`            | `id`, `projectId`, `title`, `messages`, `isPinned`, `createdAt`, `updatedAt`. Owns conversation history; survives individual failed or cancelled runs. Selecting a different `Provider` mid-conversation keeps the same session context (§3.1).                                                                                                                                           |
| **`Run`**            | `RunId`                     | A single execution attempt within a `Conversation`. Has its own lifecycle independent of the conversation's existence.                                                                                                                                                                                                                                                                    |
| **`RunEnvironment`** | Value Object                | `useNewWorktree` (boolean), `gitBranch` (from repo branches), `environmentName`.                                                                                                                                                                                                                                                                                                          |
| **`ToolCall`**       | `ToolCallId`                | `kind` (`search`, `command`, `list_files`, etc.), `summary`, `detail`, `status`. Rendered in collapsible `ToolActivityRow` molecules.                                                                                                                                                                                                                                                     |
| **`Hook`**           | `HookId`                    | `name`, `isNew` (`Nuevo` badge), `origin`, `hookType` (e.g., `PreToolUse`), `command`, `timeoutMs`, `approvalStatus`. The decision about a hook is **project-scoped**: a hook the user declines (`Ahora no`) is remembered per `Project` through `HookDecision`, not per run and not globally (decision 2026-10-16).                                                                      |
| **`Subagent`**       | `SubagentId`                | A run's child agent with its own model, effort, duration and transcript. Status is one of `processing`, `finished`, `failed`, `cancelled`—all four exist (decision 2026-10-16)—and a subagent can be stopped individually without cancelling its parent `Run` (§3.2; behaviour ticket #14).                                                                                               |
| **`DiffFile`**       | Value Object                | `path`, `addedCount`, `removedCount`, `hunks` (`context`, `added`, `removed` lines). Rendered `unified` only; `split` is deferred (decision 2026-10-16; ticket #13).                                                                                                                                                                                                                      |

---

## 3. Critical Domain Invariants

### 3.1 Composer Selection Chain (`Provider → Model → Effort`)

1. The available `Model` catalog is strictly determined by the currently selected `Provider`.
2. **Transition Rule**: Changing `ProviderId` MUST immediately reconcile and reset `ModelId` to a valid model belonging to the new provider, and reconcile `EffortLevel` to a stop supported by that model.
3. **Concurrency Rule**: If an async catalog request for a previous provider resolves after the user switched to another provider, the stale response MUST be discarded.
4. **Effort Source Rule**: The `EffortLevel` stops come from the provider for the selected model. A universal ladder and a fixed stop count are explicitly rejected (decision 2026-10-16); the concrete per-provider/per-model mapping is still open (§4, research ticket #31) and MUST NOT be invented or presented as data.
5. **Session Continuity Rule**: Changing `ProviderId` mid-conversation keeps the same session context—the conversation continues under the new provider instead of starting a fresh provider session (decision 2026-10-16). Provider adapters (#25, #26, #27) MUST therefore accept the existing conversation context on a provider change.
6. **Explicit Provider Rule** (decision 2026-10-20): no provider is preselected. On load, for a new conversation, and whenever there is no valid prior choice, the composer is in a "no provider selected yet" state: the provider chip says so, the model chip is disabled, the effort chip is not drawn, and a hint explains that a provider and a model must be chosen. Sending is blocked (the draft is kept) and no run starts without an explicit provider. The catalog's registration order never picks a provider. If the chosen provider leaves the catalog, the composer returns to the unselected state—never to another provider. After an explicit provider choice, the model and effort still default to that provider's first model at its first supported stop (item 2).

### 3.2 `Run` Lifecycle & State Transitions

```text
pending / started
  ├──► streaming (textDelta | toolActivity | hookReviewRequired)
  │      ├──► completed   (terminal)
  │      ├──► failed      (terminal)
  │      └──► cancelled   (terminal via cancel_run)
```

- **Single Authoritative Terminal State**: A `Run` can finish in exactly one terminal state (`completed`, `failed`, or `cancelled`). Concurrent completion and cancellation races must resolve deterministically in the Rust `RunSupervisor`.
- **Run vs Conversation Separation**: A `failed` or `cancelled` `Run` does not delete or corrupt its parent `Conversation`.
- **Panel Close Resilience**: Closing or unmounting a UI panel (`RightPanel` or `ConversationView`) must not accidentally destroy an active `Run` in the Rust core.
- **Subagent Control**: A `Subagent` reports one of four states (`processing`, `finished`, `failed`, `cancelled`, decision 2026-10-16) and can be stopped individually. Stopping one MUST resolve that subagent to `cancelled` without cancelling or corrupting its parent `Run` (behaviour ticket #14).

### 3.3 Workspace & Path Authority

- A `Project` authorizes specific root folders (`WorkspacePath`).
- Every file read, file write, diff inspection, or child process `cwd` requested by the UI or by an agent tool call MUST be validated in Rust against the project's canonicalized workspace roots (rejecting `..` traversal, unauthorized symlinks, and out-of-workspace absolute paths).

### 3.4 No Hardcoded Placeholder Data

- Names shown in wireframes (`"ChatGPT"`, `"GPT-6.1 Sol"`, `"Codex"`, sample project names, sample OpenCode models) are visual placeholders only. Production code must load providers, models, branches, and projects through domain abstractions and ports.
- Provider catalogs carry the provider's **real** models, sourced from that provider's own configuration. The OpenCode model names in the wireframes are examples only (decision 2026-10-16; real-model tickets #25, #26, #27).

### 3.5 Locked Behaviour for Surfaces Not Yet Built

Decisions 2026-10-16 (issue #30) whose surfaces are tracked by other tickets. They are recorded here so those tickets do not have to re-ask. **None of them is implemented by this change—do not pre-build them.**

1. **`DiffView` Modes** (ticket #13): `unified` only. The wireframe toolbar draws `unified` and `split`, but only `unified` is in scope; `split` is deferred.
2. **Message Timestamp & Editing** (ticket #11): both are in scope. They are buttons rendered below the message bubbles; the wireframe does not draw them yet.
3. **`Abrir` Menu** (ticket #12): only VS Code is offered. The option MUST NOT appear when VS Code is not installed on the machine, and no other editor or shell target replaces it for now.
4. **No Like/Feedback Message Action** (2026-10-21, issue #89, implemented): the assistant message actions row MUST NOT render a like/feedback (thumb-up) control. This deliberately overrides the wireframe (`docs/wireframes/12-chat-conversation-full.html`, `.msg-actions`, and the `MessageActions` row of `docs/wireframes/README.md`). The button never had a handler, so its prop, message key, icon glyph and test assertion were removed with it; copy and share stay (copy behaviour: #88).

### 3.6 Application Identity in the Sidebar Header (2026-10-17, issue #41)

1. **Static application brand.** The sidebar header displays the application name `Nx`. It MUST NOT display a `Provider.displayName`, even when a provider is resolved. This deliberately overrides the wireframe (`docs/wireframes/02-home-sidebar.html`, which draws a provider name) and supersedes the #10 behaviour where the brand followed the active provider. Provider identity remains visible in the composer's provider selector; the sidebar header is product identity, not session state.
2. **Notifications and search deferred.** The header's bell (notifications) and magnifier (search) controls are **deferred for now**, not permanently removed: no replacement, no placeholder, and no half-wired handler. Their message keys were removed with them; a later ticket reintroduces the surface and its copy together.
3. **No brand chevron.** The chevron was removed because a static brand has nothing to switch or disclose. No brand switcher is planned in its place; a future switcher must add its own control, handler and accessible state.

### 3.7 Native Window Chrome and Application Menu (2026-10-17, issue #42)

The maintainer required the native window chrome (issue #42; decision comment `6239923847`). This deliberately overrides the wireframe's drawn title bar (`docs/wireframes/README.md`, "Ground rules for implementation" and "Layout regions") and supersedes it.

1. **Native frame kept.** The window keeps the OS title bar and its minimize/maximize/close controls; `decorations` stays enabled in `src-tauri/tauri.conf.json`. The frontend MUST NOT render a drawn title bar, a drawn menu bar or drawn window controls. The old controls were inert — `window-controls.tsx` took optional `onMinimize`/`onMaximize`/`onClose`, its only caller passed labels alone so all three were `undefined`, and no Rust window command existed — so removing them removed a click that did nothing.
2. **Native application menu from platform defaults.** The application menu is declared in Rust (`src-tauri/src/lib.rs`) with Tauri's `Menu::default`, unconditionally on every desktop platform: macOS would install a default menu on its own, but Windows and Linux show no menu bar unless the app sets one. The menu contains only predefined OS/Tauri items and **no product commands.** The four wireframe labels `Archivo`, `Edición`, `Ver`, `Ayuda` were removed from `messages.ts` and MUST NOT be ported to the Rust declaration nor reintroduced as frontend copy; a native menu's labels belong where the native menu is declared. Product-specific menu actions remain out of scope until separately defined.
3. **Region toggles belong to the app's own UI.** The sidebar and right-panel toggles drive region visibility that already exists (`shell-state`, `src/shared/ui/layout/region-visibility.ts`). They live in the **rail**, the app's own navigation surface, not in a strip the OS owns. Their owner and transitions do not change: the shell still owns `ShellState.visibility` and the rail only reports presses upward.
4. **Back/forward removed as decorative.** The history control was always disabled: neither button had an enabling state or a handler anywhere in `src/`, there was no history state that could drive them, and the wireframe's "history navigation" was drawn chrome. It is removed rather than relocated; a future navigation history introduces its own state, control and handler together.

---

## 4. Open Product Questions (Ask Before Locking Behavior)

Product questions 1–9 are answered and locked (see the header note and the sections above). Two items remain genuinely open. **Do not silently invent product policy** for them—ask the user to confirm:

1. **Per-Provider/Per-Model Effort Mapping**: the _rule_ is locked—each provider supplies the effort stops its models expose, the count varies, and there is no universal ladder (§2 `EffortLevel`, §3.1 item 4). The _mapping_—the exact stops each provider and model exposes—is the deliverable of the effort-level research ticket (#31). Placeholder stops MUST NOT be presented as real data.
2. **Rejected Hook Semantics**: it is locked that declining a hook (`Ahora no`) is a project-scoped decision that is remembered and not re-prompted (§2 `Hook`). It is **not** specified whether declining a hook must also block the tool call the hook guards, or only skip running the hook script. The Rust core records the decision and never executes a rejected hook; it does not infer blocking. Ask the product owner before implementing blocking behaviour.
