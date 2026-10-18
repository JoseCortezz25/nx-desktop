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

/**
 * The vocabulary the render layer groups the panel list by
 * (`subagent-view.ts`); it is the discriminator key of the union above, so a
 * kind added to the vocabulary cannot compile without copy and grouping.
 */
export const SUBAGENT_STATUS_KINDS = [
  'processing',
  'finished',
  'failed',
  'cancelled'
] as const;

/**
 * Lifecycle state of a subagent, built as a discriminated union so a consumer
 * can never treat it as a bare string and each state can carry its own payload
 * when one is needed (decision 2026-10-16, issue #30, mirrored in
 * `business-logic.md` §3.2: all four states exist and a subagent can be stopped
 * individually, resolving to `cancelled` without cancelling its parent `Run`).
 *
 * The set deliberately stays open: the states beyond "processing" and the
 * individual stop are open questions of the product, and adding a member here
 * is typed in the copy map (`messages.ts`) and the group order at once.
 */
export type SubagentStatus =
  | { readonly kind: 'processing' }
  | { readonly kind: 'finished' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'cancelled' };

/** The single member the status union discriminates on. */
export type SubagentStatusKind = SubagentStatus['kind'];

export interface Subagent {
  readonly id: SubagentId;
  readonly name: string;
  /**
   * Presentation avatar variant the render layer draws (`'globe'`, `'flower'`,
   * ...); the shapes are decoration, so the stored value stays a portable key.
   */
  readonly avatar: string;
  readonly status: SubagentStatus;
  /** Time the subagent has spent running, frozen when it leaves `processing`. */
  readonly elapsedMs: number;
  readonly modelId: ModelId;
  readonly effortLevel: EffortLevel;
  /**
   * The subagent's own transcript, newest last, drawn by `SubagentDetail`
   * behind the collapsed-earlier divider (wireframe 22). It is the child run's
   * message stream on its own, not the parent conversation's history.
   */
  readonly transcript: readonly ConversationMessage[];
}
