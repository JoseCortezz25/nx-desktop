/**
 * The pure view model of the right panel's subagents viewer
 * (`docs/wireframes/README.md`, "Reusable components" — `SubagentList` and
 * `SubagentDetail`; screens 21 and 22).
 *
 * Everything the panel and its viewer draw over `Subagent` records is derived
 * here so the components never encode a rule inline: the group order, the
 * individual stop transition, the transcript collapse window and the elapsed
 * read-out are all pure functions, unit-tested under `node` with no DOM.
 */
import type { Subagent, SubagentStatus } from '@/shared/domain/subagent.types';
import type { SubagentStatusKind } from '@/shared/domain/subagent.types';
import type {
  ConversationMessage,
  MessageRole
} from '@/shared/domain/conversation.types';

/** The panel list groups on this subset of each subagent's status. */
export interface SubagentGroup {
  readonly kind: SubagentStatusKind;
  readonly subagents: readonly Subagent[];
}

/**
 * How many transcript entries the detail keeps visible while earlier ones stay
 * collapsed behind the divider (wireframe 22 draws the newest few and "N
 * mensajes anteriores" over the rest).
 */
export const RECENT_TRANSCRIPT_COUNT = 3;

/**
 * Group order: what is still running leads the list, then what wrapped up.
 * A kind that gains no copy later cannot appear here without failing, so the
 * order is itself part of the locked contract of S3.
 */
const GROUP_ORDER: readonly SubagentStatusKind[] = [
  'processing',
  'finished',
  'cancelled',
  'failed'
];

/**
 * Groups the list one bucket per status kind, in `GROUP_ORDER`, keeping the
 * input order inside each bucket and dropping kinds nobody is in. Returns new
 * arrays; the input is never mutated.
 */
export function groupSubagents(
  subagents: readonly Subagent[]
): readonly SubagentGroup[] {
  const buckets = new Map<SubagentStatusKind, Subagent[]>();

  for (const subagent of subagents) {
    const bucket = buckets.get(subagent.status.kind) ?? [];
    bucket.push(subagent);
    buckets.set(subagent.status.kind, bucket);
  }

  return GROUP_ORDER.filter(kind => buckets.has(kind)).map(kind => ({
    kind,
    subagents: buckets.get(kind) ?? []
  }));
}

/**
 * Resolves one subagent individually to `cancelled` (`business-logic.md` §3.2:
 * stopping a child never touches the parent `Run`). A record that already left
 * `processing` keeps its outcome — stopping a finished run again changes
 * nothing — and the transition returns a new record, never a mutation.
 */
export function stopSubagent(subagent: Subagent): Subagent {
  return subagent.status.kind === 'processing'
    ? { ...subagent, status: { kind: 'cancelled' } satisfies SubagentStatus }
    : subagent;
}

/** Split of one transcript behind the detail's collapsed-earlier divider. */
export interface TranscriptWindow {
  readonly earlier: readonly ConversationMessage[];
  readonly recent: readonly ConversationMessage[];
}

/**
 * Partitions a transcript so the newest entries render and the rest collapse
 * into the "N mensajes anteriores" divider (wireframe 22). Pure on both sides:
 * the input is never mutated, and both windows always come back as fresh
 * arrays even when one of them is empty.
 */
export function splitTranscript(
  transcript: readonly ConversationMessage[],
  recentCount: number = RECENT_TRANSCRIPT_COUNT
): TranscriptWindow {
  if (transcript.length <= 0) {
    return { earlier: [], recent: [] };
  }

  const window = Math.max(0, recentCount);
  const recent: readonly ConversationMessage[] =
    window === 0 ? [] : transcript.slice(-window);
  const earlier = transcript.slice(0, transcript.length - recent.length);

  return { earlier, recent };
}

/**
 * The elapsed read-out the list rows and the detail header print
 * (wireframe 21 rows draw `5m 59s`). Whole units only: a partial minute rounds
 * down (`90_000` → `1m 30s`), and past the hour boundary the seconds drop, so a
 * one-hour run reads `1h 0m` instead of `1h 0m 40s`. The units are duration
 * glyphs (`h`/`m`/`s`), not prose copy, so they need no message key.
 */
export function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Convenience the mock seed and the demo composition use: one transcript
 * entry, an assistant-authored message with no tool activity.
 */
export function transcriptEntry(
  id: string,
  role: MessageRole,
  content: string,
  createdAt: string
): ConversationMessage {
  return { id, role, content, createdAt, toolCalls: [] };
}
