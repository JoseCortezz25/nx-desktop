/**
 * Value objects shared across the domain vocabulary.
 *
 * These aliases document intent at call sites (a `ProviderId` is not a
 * `ModelId`) while staying assignable to the opaque strings that will cross the
 * Tauri boundary in `camelCase`. Keeping them in one cohesive module avoids
 * circular imports between entity files that reference each other's identity.
 *
 * Source: `.claude/knowledge/business-logic.md` §2 (Core Domain Abstractions).
 */
export type ProviderId = string;
export type ModelId = string;
export type ProjectId = string;
export type WorkspacePath = string;
export type ConversationId = string;
export type MessageId = string;
export type ToolCallId = string;
export type HookId = string;
export type SubagentId = string;

/** ISO-8601 timestamp string, as delivered over the IPC boundary. */
export type IsoTimestamp = string;
