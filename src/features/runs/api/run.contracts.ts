/**
 * Wire contracts for runs and the run stream (issue #16, slice 3).
 *
 * These `*Dto` shapes are the camelCase JSON that crosses the Tauri boundary.
 * They mirror `src-tauri/src/features/runs/dto.rs` and the shared fixtures in
 * `docs/ipc/fixtures/`. The tool-activity frame carries the conversation
 * feature's `ToolCallDto`, so one product entity has one wire shape across
 * modules instead of a second copy that can drift
 * (`docs/research-tecnico/arquitectura-tauri.md`, "Estructura de archivos":
 * expose what crosses a module from the module itself).
 *
 * The Rust `RunSupervisor`, the service, command registration and the six-kind
 * emission belong to #19; this module defines the seam only.
 * (`.claude/rules/ipc-and-contracts.md` §1, §5.)
 */
import type { ToolCallDto } from '@/features/conversations/api/conversation.contracts';
import type { AppErrorDto } from '@/shared/ipc/contracts';

/**
 * Lifecycle states of a run, derived from the run lifecycle in
 * `.claude/knowledge/business-logic.md` §3.2. `started` is a stream frame kind,
 * not a status: a run that has emitted `started` is `streaming`, and is
 * `pending` before the first frame. #19 owns the transitions.
 */
export const RUN_STATUSES = [
  'pending',
  'streaming',
  'completed',
  'failed',
  'cancelled'
] as const;

/** Lifecycle state of a run. */
export type RunStatus = (typeof RUN_STATUSES)[number];

/**
 * Where a run executes, as chosen in the composer environment popover
 * (`.claude/knowledge/business-logic.md` §2 `RunEnvironment`). `gitBranch` must
 * come from the project's own branch list through `list_workspace_branches`.
 */
export interface RunEnvironmentDto {
  /** Run in a fresh git worktree instead of the current checkout. */
  useNewWorktree: boolean;
  gitBranch: string;
  environmentName: string;
}

/**
 * Request envelope for `start_run`.
 *
 * Deliberately carries **no** `approvalMode`: the tool approval policy is
 * project-scoped and resolved in the Rust core, never trusted from the UI
 * (`.opencode/knowledge/critical-constraints.md` §7). `projectId` is
 * authority-bearing — the approval policy and workspace roots belong to the
 * project — and #19 enforces the invariant `conversation.projectId == projectId`.
 */
export interface StartRunRequestDto {
  conversationId: string;
  projectId: string;
  providerId: string;
  modelId: string;
  effortLevel: string;
  prompt: string;
  environment: RunEnvironmentDto;
}

/**
 * The authoritative run snapshot returned by every run command.
 *
 * `get_run` reads the same shape for snapshot-on-reopen: a remounted panel
 * queries the authoritative state instead of trusting buffered deltas
 * (`.opencode/knowledge/architecture-patterns.md` §4). The richer snapshot
 * payload (accumulated text and tool activity) is a #19 decision, not invented
 * here.
 */
export interface RunDto {
  runId: string;
  conversationId: string;
  projectId: string;
  status: RunStatus;
}

/** Request envelope for `cancel_run`; `runId` is the authority token. */
export interface CancelRunRequestDto {
  runId: string;
}

/** Request envelope for `get_run`; the snapshot-on-reopen read. */
export interface GetRunRequestDto {
  runId: string;
}

/**
 * The kinds of a run stream frame, aligned with the normative six-kind set
 * (`.claude/rules/ipc-and-contracts.md` §5,
 * `.opencode/skills/tauri-ipc-command/SKILL.md`). `hookReviewRequired` appears in
 * prose but **not** here; if #20 needs a push frame for hook review it must
 * amend this contract, because the union is closed.
 */
export const RUN_STREAM_EVENT_KINDS = [
  'started',
  'textDelta',
  'toolActivity',
  'completed',
  'failed',
  'cancelled'
] as const;

/** The single member a {@link RunStreamEventDto} discriminates on. */
export type RunStreamEventKind = (typeof RUN_STREAM_EVENT_KINDS)[number];

/**
 * One incremental frame of a run's `Channel` stream.
 *
 * Internally tagged by `kind`; every frame carries `runId` and a monotonic
 * `seq` so a consumer can order frames and drop stale ones. The union is a
 * discriminated union so an exhaustive `switch` fails the build when a kind is
 * added or dropped.
 */
export type RunStreamEventDto =
  | { kind: 'started'; runId: string; seq: number }
  | { kind: 'textDelta'; runId: string; seq: number; text: string }
  | { kind: 'toolActivity'; runId: string; seq: number; toolCall: ToolCallDto }
  | { kind: 'completed'; runId: string; seq: number }
  | { kind: 'failed'; runId: string; seq: number; error: AppErrorDto }
  | { kind: 'cancelled'; runId: string; seq: number };
