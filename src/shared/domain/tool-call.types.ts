/**
 * A tool invocation surfaced inside a conversation message.
 *
 * Rendered by the collapsible `ToolActivityRow` molecule
 * (`docs/wireframes/README.md`, "Reusable components"). The kind list below
 * covers the values named in `.claude/knowledge/business-logic.md` §2; it is
 * extended as new tool kinds appear.
 */
import type { ToolCallId } from './value-objects.types';

export const TOOL_CALL_KINDS = ['search', 'command', 'list_files'] as const;

/** The kind of tool that ran, e.g. a search or a shell command. */
export type ToolCallKind = (typeof TOOL_CALL_KINDS)[number];

export const TOOL_CALL_STATUSES = [
  'pending',
  'running',
  'completed',
  'failed'
] as const;

/** Lifecycle of a single tool invocation. */
export type ToolCallStatus = (typeof TOOL_CALL_STATUSES)[number];

export interface ToolCall {
  readonly id: ToolCallId;
  readonly kind: ToolCallKind;
  readonly summary: string;
  /** Expandable detail shown when the row is opened. */
  readonly detail: string;
  readonly status: ToolCallStatus;
}
