/**
 * A subagent spawned by a run, with its own transcript and selection chain.
 *
 * Rendered by the `SubagentList` and `SubagentDetail` components
 * (`docs/wireframes/README.md`, screens 21–22). The status list covers the
 * states named in the open questions; it is provisional until the product
 * confirms the full set (§4, last item).
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

/** Lifecycle state of a subagent. */
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
