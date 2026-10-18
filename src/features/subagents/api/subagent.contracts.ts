/**
 * Wire contracts for subagents (issue #16, slice 3).
 *
 * These `*Dto` shapes are the camelCase JSON that crosses the Tauri boundary.
 * They mirror `src-tauri/src/features/subagents/dto.rs` and the shared fixtures
 * in `docs/ipc/fixtures/`. A subagent's transcript is a child run's own message
 * stream, so the contract reuses the conversation feature's
 * `ConversationMessageDto` rather than keeping a second wire copy that can
 * drift (`docs/research-tecnico/arquitectura-tauri.md`, "Estructura de
 * archivos").
 *
 * The child-run supervisor and the stop use case belong to #19/#23; this module
 * defines the wire intent only and invents no lifecycle behavior.
 * (`.claude/knowledge/business-logic.md` §2 `Subagent`, §3.2.)
 */
import type { ConversationMessageDto } from '@/features/conversations/api/conversation.contracts';
import type { EffortLevel } from '@/shared/domain/effort-level.types';
import type { SubagentStatusKind } from '@/shared/domain/subagent.types';
import type { ModelId, SubagentId } from '@/shared/domain/value-objects.types';

/**
 * A run's child agent with its own model, effort, duration and transcript.
 *
 * `status` is the flat wire form of the domain's four-state discriminated
 * union (`processing` | `finished` | `failed` | `cancelled`); a subagent can be
 * stopped individually without cancelling its parent run (§3.2).
 */
export interface SubagentDto {
  id: SubagentId;
  name: string;
  /** Portable presentation key; the render layer maps it to a shape. */
  avatar: string;
  status: SubagentStatusKind;
  /** Time the subagent has spent running, frozen when it leaves `processing`. */
  elapsedMs: number;
  modelId: ModelId;
  effortLevel: EffortLevel;
  /** The child run's own transcript, oldest first. */
  transcript: ConversationMessageDto[];
}

/** Request envelope for `list_subagents`; `runId` is the authority context. */
export interface ListSubagentsRequestDto {
  runId: string;
}

/**
 * Request envelope for `cancel_subagent`; the intent-driven individual stop.
 *
 * `runId` and `subagentId` are both authority-bearing: the core resolves the
 * child run within its parent and rejects a subagent from another run.
 */
export interface CancelSubagentRequestDto {
  runId: string;
  subagentId: SubagentId;
}
