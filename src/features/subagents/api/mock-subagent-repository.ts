/**
 * In-memory subagent runs used until the Rust core streams real child runs.
 *
 * The seed is what wireframes 21 and 22 draw: two `processing` research
 * subagents (`Inspect repo`, `5m 59s` and `Tauri research`, `6m 13s`), whose
 * detail carries the model·effort pair and the collapsed transcript the
 * detail wireframe prints (`12 mensajes anteriores` over the newest three).
 * The model and effort values are ids of the existing provider catalog, not
 * placeholders invented for this surface, and the bodies are authored samples
 * — real child runs arrive through the port (#19, #23).
 *
 * The seed keeps its own statements in agreement
 * (`mock-subagent-repository.test.ts` pins them).
 */
import type { Subagent } from '@/shared/domain/subagent.types';
import type { SubagentRepository } from './subagent-repository';

function entries(messages: readonly [id: string, content: string][]) {
  return messages.map(([id, content], index) => ({
    id,
    role: 'assistant' as const,
    content,
    createdAt: `2026-10-18T09:${String(index).padStart(2, '0')}:00Z`,
    toolCalls: []
  }));
}

const INSPECT_EARLIER = entries([
  ['sa-01', 'Ran rg --files docs/research-tecnico 2>/dev/null'],
  ['sa-02', 'Searched the web: architecture patterns for desktop agents'],
  ['sa-03', 'Read docs/research-tecnico/arquitectura-tauri.md'],
  ['sa-04', 'Ran wc -l docs/research-tecnico/arquitectura-tauri.md'],
  ['sa-05', 'Searched the web: Tauri capabilities and permission model'],
  [
    'sa-06',
    'Compared modular monolith and multi-crate layouts against the brief'
  ],
  ['sa-07', 'Ran git log --oneline src-tauri | head -20'],
  ['sa-08', 'Read .opencode/knowledge/critical-constraints.md'],
  [
    'sa-09',
    'Outlined the guide: module boundaries, ports, adapters, workspace rules'
  ],
  [
    'sa-10',
    'Read docs/research-tecnico/arquitectura-tauri.md (second pass, sections 4-7)'
  ],
  [
    'sa-11',
    'Searched the web: Vitest, WebdriverIO and tauri-driver support matrices'
  ],
  [
    'sa-12',
    'Summarized findings per module and marked the open product questions'
  ]
]);

const INSPECT_RECENT = entries([
  [
    'sa-13',
    'Draft recommendations: modular monolith with modules per business capability; ports and adapters at the boundaries with agents, filesystem, Git and persistence. Avoid microservices and multiple crates for now.'
  ],
  [
    'sa-14',
    'Separate the agent engine from the model provider: OpenCode, Codex and Claude do not share protocol, transport, catalog or approval semantics — the contracts must represent the difference.'
  ],
  [
    'sa-15',
    'Review completed, no file changes and no builds. No substantive contradictions between the diagnosis and the repository; communicated one optional improvement about business approval versus engine authorization.'
  ]
]);

const RESEARCH_RECENT = entries([
  ['sa-101', 'Searched the web: Tauri 2 streaming channels'],
  ['sa-102', 'read src-tauri capabilities'],
  ['sa-103', 'Outlined the channel approach for run streaming'],
  ['sa-104', 'Read src-tauri capabilities and the run feature stubs'],
  [
    'sa-105',
    'Tauri channels cover the streaming path; commands stay the request/response surface and cancellation needs an explicit identity model.'
  ]
]);

/**
 * The demo record set the panel opens on. Order: wireframe 21's two live rows
 * first; richer states (finished, failed, cancelled) are exercised from unit
 * data so the open list always matches the wireframe exactly.
 */
export function subagentRepositorySeed(): readonly Subagent[] {
  return [
    {
      id: 'subagent-inspect-repo',
      name: 'Inspect repo',
      avatar: 'globe',
      status: { kind: 'processing' },
      elapsedMs: 359_000,
      modelId: 'gpt-5-codex',
      effortLevel: 'light',
      transcript: [...INSPECT_EARLIER, ...INSPECT_RECENT]
    },
    {
      id: 'subagent-tauri-research',
      name: 'Tauri research',
      avatar: 'flower',
      status: { kind: 'processing' },
      elapsedMs: 373_000,
      modelId: 'glm-4.6',
      effortLevel: 'maximum',
      transcript: RESEARCH_RECENT
    }
  ];
}

export function createMockSubagentRepository(): SubagentRepository {
  return {
    async listSubagents() {
      return subagentRepositorySeed();
    }
  };
}
