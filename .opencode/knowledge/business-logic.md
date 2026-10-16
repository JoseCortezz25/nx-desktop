# Business Logic & Domain Model

**Essential domain concepts, entity lifecycles, invariants, and open product questions for `nx-desktop`.**
Derived from `docs/wireframes/README.md` and `docs/research-tecnico/arquitectura-tauri.md`.

---

## 1. Product Purpose

`nx-desktop` is a provider-agnostic desktop coding-agent application. Users organize workspaces into **Projects**, run multi-turn coding **Conversations**, switch between coding-agent **Providers** (`OpenCode`, `Codex`, `Claude`) and their **Models**, configure **Effort** and **Approval Mode**, inspect **Tool Activity** and **Hooks** (`PreToolUse`), and review code changes in a side-by-side or unified **Right Panel** (`DocumentView`, `CodeView`, `DiffView`).

---

## 2. Core Domain Abstractions

| Concept              | Identity / Value            | Key Fields & Responsibilities                                                                                                                                                                                       |
| -------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`Provider`**       | `ProviderId` (Value Object) | `id`, `displayName`, `icon`, `subtitle`, `availableModels`. Represents a coding-agent engine (`opencode`, `codex`, `claude`), which may manage sessions, tools, and multiple models—not just an HTTP chat endpoint. |
| **`Model`**          | `ModelId` (Value Object)    | `id`, `displayName`, `providerId`, `supportedEffortLevels`. Scoped strictly to its parent `Provider`.                                                                                                               |
| **`EffortLevel`**    | Enum / Value Object         | 5-stop effort scale (wireframes show 5 stops starting with light effort). Valid values depend on the selected `Model`.                                                                                              |
| **`ApprovalMode`**   | Enum                        | 3 levels: `ask_always` (ask before tool execution), `auto_approve` (approve safe/scoped tools), `full_access` (unrestricted within policy). Enforced in the Rust core, never by UI hiding alone.                    |
| **`Project`**        | `ProjectId`                 | `id`, `name`, `workspaceFolders` (one or more authorized local source directories), `conversations`.                                                                                                                |
| **`Conversation`**   | `ConversationId`            | `id`, `projectId`, `title`, `messages`, `isPinned`, `createdAt`, `updatedAt`. Owns conversation history; survives individual failed or cancelled runs.                                                              |
| **`Run`**            | `RunId`                     | A single execution attempt within a `Conversation`. Has its own lifecycle independent of the conversation's existence.                                                                                              |
| **`RunEnvironment`** | Value Object                | `useNewWorktree` (boolean), `gitBranch` (from repo branches), `environmentName`.                                                                                                                                    |
| **`ToolCall`**       | `ToolCallId`                | `kind` (`search`, `command`, `list_files`, etc.), `summary`, `detail`, `status`. Rendered in collapsible `ToolActivityRow` molecules.                                                                               |
| **`Hook`**           | `HookId`                    | `name`, `isNew` (`Nuevo` badge), `origin`, `hookType` (e.g., `PreToolUse`), `command`, `timeoutMs`, `approvalStatus`.                                                                                               |
| **`DiffFile`**       | Value Object                | `path`, `addedCount`, `removedCount`, `hunks` (`context`, `added`, `removed` lines).                                                                                                                                |

---

## 3. Critical Domain Invariants

### 3.1 Composer Selection Chain (`Provider → Model → Effort`)

1. The available `Model` catalog is strictly determined by the currently selected `Provider`.
2. **Transition Rule**: Changing `ProviderId` MUST immediately reconcile and reset `ModelId` to a valid model belonging to the new provider, and reconcile `EffortLevel` to a stop supported by that model.
3. **Concurrency Rule**: If an async catalog request for a previous provider resolves after the user switched to another provider, the stale response MUST be discarded.

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

### 3.3 Workspace & Path Authority

- A `Project` authorizes specific root folders (`WorkspacePath`).
- Every file read, file write, diff inspection, or child process `cwd` requested by the UI or by an agent tool call MUST be validated in Rust against the project's canonicalized workspace roots (rejecting `..` traversal, unauthorized symlinks, and out-of-workspace absolute paths).

### 3.4 No Hardcoded Placeholder Data

- Names shown in wireframes (`"ChatGPT"`, `"GPT-6.1 Sol"`, `"Codex"`, sample project names, sample OpenCode models) are visual placeholders only. Production code must load providers, models, branches, and projects through domain abstractions and ports.

---

## 4. Open Product Questions (Ask Before Locking Behavior)

The wireframes and technical research explicitly leave these product decisions open. **Do not silently invent product policy** when implementing these features—ask the user to confirm:

1. **Effort Levels per Model**: Which exact 5 effort stops exist per model/provider, and do all models support all 5 stops?
2. **Approval Mode Scope**: Is `ApprovalMode` persisted globally, per `Project`, or per `Conversation`?
3. **Mid-Conversation Provider Switch**: Does switching `Provider` mid-conversation continue the same session context or start a new provider session?
4. **Rejected Hooks (`Ahora no`)**: When a user declines a hook in the Hooks Review Modal, is the hook blocked for the current run only, re-prompted next run, or persisted as disabled in Settings (`Ajustes`)?
5. **Diff View Modes**: Should `DiffView` implement both `unified` and `split` modes now, or `unified` first?
6. **Message Timestamp & Editing**: Wireframes note that message timestamps and editing are requested but not yet drawn—confirm UX before implementing.
