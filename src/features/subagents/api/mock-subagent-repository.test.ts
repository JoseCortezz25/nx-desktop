import { describe, expect, it } from 'vitest';
import { PROVIDER_FIXTURES } from '@/features/providers/api/mock-provider-repository';
import {
  createMockSubagentRepository,
  subagentRepositorySeed
} from './mock-subagent-repository';
import { AVATAR_VARIANTS } from './subagent-repository';

const MODELS = PROVIDER_FIXTURES.flatMap(provider => provider.availableModels);

describe('the subagents demo seed', () => {
  const seed = subagentRepositorySeed();

  const ids = new Set(seed.map(one => one.id));

  it('mirrors wireframe 21: two processing subagents with names and avatars', () => {
    const live = seed.filter(one => one.status.kind === 'processing');

    expect(live).toHaveLength(2);
    expect(live.map(one => one.status)).toEqual([
      { kind: 'processing' },
      { kind: 'processing' }
    ]);
    for (const one of live) {
      expect(one.name.trim()).not.toBe('');
      expect(one.avatar).not.toBe('');
    }
  });

  it('only pairs models and effort stops the provider catalog advertises', () => {
    for (const one of seed) {
      const model = MODELS.find(candidate => candidate.id === one.modelId);

      expect(model, `unknown model ${one.modelId}`).toBeDefined();
      expect(
        model?.supportedEffortLevels,
        `${one.modelId} does not advertise ${one.effortLevel}`
      ).toContain(one.effortLevel);
    }
  });

  it('uses the avatar variants the presentation layer knows', () => {
    for (const one of seed) {
      expect(AVATAR_VARIANTS).toContain(one.avatar);
    }
  });

  it('derives the wireframe 21 elapsed times from the records', () => {
    expect(
      seed.filter(one => one.id === 'subagent-inspect-repo')[0]?.elapsedMs
    ).toBe(359_000);
    expect(
      seed.filter(one => one.id === 'subagent-tauri-research')[0]?.elapsedMs
    ).toBe(373_000);
  });

  it('keeps the transcript messages unique and well-formed', () => {
    for (const one of seed) {
      const messageIds = one.transcript.map(message => message.id);

      expect(new Set(messageIds).size).toBe(messageIds.length);
      for (const message of one.transcript) {
        expect(message.content.trim()).not.toBe('');
        expect(Date.parse(message.createdAt)).not.toBeNaN();
      }
    }
  });

  it('the detail seed keeps twelve earlier messages behind the divider', () => {
    // Wireframe 22 draws "12 mensajes anteriores" over the newest three, so the
    // demo data carries those windows too — the collapsed proof is visual.
    const inspect = seed.filter(one => one.id === 'subagent-inspect-repo')[0];

    expect(inspect?.transcript.length).toBeGreaterThanOrEqual(12 + 3);
  });

  it('serves the same records asynchronously through the port', async () => {
    const repository = createMockSubagentRepository();

    await expect(repository.listSubagents()).resolves.toEqual(seed);
    expect(ids.size).toBe(seed.length);
    expect(ids.has('subagent-inspect-repo')).toBe(true);
  });
});
