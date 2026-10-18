/**
 * The subagents port.
 *
 * The panel reads its list through this boundary while #19/#23 wire the real
 * `RunSupervisor` child runs behind it; the typed interface is the only thing
 * the viewer knows, so the mock swap later replaces data, not components
 * (decision 2026-10-16, `business-logic.md` §2 `Subagent`).
 */
import type { Subagent } from '@/shared/domain/subagent.types';

/** Avatar variants the presentation layer can draw today. */
export const AVATAR_VARIANTS = ['globe', 'flower'] as const;

export type SubagentAvatarVariant = (typeof AVATAR_VARIANTS)[number];

export interface SubagentRepository {
  listSubagents(): Promise<readonly Subagent[]>;
}
