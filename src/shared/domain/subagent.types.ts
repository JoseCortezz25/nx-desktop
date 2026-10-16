/**
 * A subagent spawned by a run, with its own transcript and selection chain.
 *
 * Rendered by the `SubagentList` and `SubagentDetail` components
 * (`docs/wireframes/README.md`, screens 21–22; `.claude/knowledge/business-logic.md`
 * §2 `Subagent` and §3.2).
 */
import type { EffortLevel } from './effort-level.types';
import type { ConversationMessage } from './conversation.types';
import type { ModelId, SubagentId } from './value-objects.types';

export const SUBAGENT_STATUSES = [
  'processing',
  'finished',
  'failed',
  'cancelled'
] as const;

/**
 * Lifecycle state of a subagent.
 *
 * Locked rule (decision 2026-10-16, issue #30): all four states exist. A
 * subagent can also be stopped individually, resolving to `cancelled` without
 * cancelling its parent `Run`; that behaviour belongs to ticket #21.
 */
export type SubagentStatus = (typeof SUBAGENT_STATUSES)[number];

export interface Subagent {
  readonly id: SubagentId;
  readonly name: string;
  readonly avatar: string;
  readonly status: SubagentStatus;
  readonly elapsedMs: number;
  readonly modelId: ModelId;
  readonly effortLevel: EffortLevel;
  readonly transcript: readonly ConversationMessage[];
}
