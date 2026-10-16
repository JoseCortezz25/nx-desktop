/**
 * Effort stops of the composer selection chain.
 *
 * The stop set belongs to the **provider/model pair**, not to this module: two
 * models on different providers may expose a different number of stops, and a
 * model's stops are discovered from its provider at runtime (decision
 * 2026-10-16, issue #30; `.claude/knowledge/business-logic.md` §2 `EffortLevel`
 * and §3.1, item 4).
 *
 * There is deliberately no global ladder constant and no fixed count — a
 * universal enumeration would re-introduce the scale that decision rejects.
 * Catalog data that exists before the real mapping is delivered is placeholder
 * data, not truth.
 *
 * The concrete per-provider/per-model mapping is still open and is the
 * deliverable of the effort-level research ticket (#31); the provider adapter
 * tickets (#25–#27) consume it.
 */
export type EffortLevel = string;
