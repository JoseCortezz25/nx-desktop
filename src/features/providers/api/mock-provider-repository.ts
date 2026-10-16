/**
 * In-memory provider catalog used until the Rust core exposes `list_providers`.
 *
 * The names, subtitles, icons, and model ids below are mock seed data standing
 * in for values the provider engines supply at runtime. They are data delivered
 * through the `ProviderRepository` abstraction — never UI copy and never
 * hardcoded inside components (`docs/wireframes/README.md`, ground rules).
 *
 * The catalog is intentionally uneven: each provider owns a different set of
 * models, and each model supports a different slice of the effort scale, so the
 * composer selection chain has real work to reconcile.
 */
import type { Provider } from '@/shared/domain/provider.types';
import type { ProviderRepository } from './provider-repository';

const providers: readonly Provider[] = [
  {
    id: 'opencode',
    displayName: 'OpenCode',
    icon: 'opencode',
    subtitle: 'Open-source coding agent',
    availableModels: [
      {
        id: 'deepseek-v3.1',
        displayName: 'DeepSeek V3.1',
        providerId: 'opencode',
        supportedEffortLevels: ['light', 'standard', 'high']
      },
      {
        id: 'kimi-k2',
        displayName: 'Kimi K2',
        providerId: 'opencode',
        supportedEffortLevels: ['light', 'standard']
      },
      {
        id: 'glm-4.6',
        displayName: 'GLM 4.6',
        providerId: 'opencode',
        supportedEffortLevels: ['standard', 'high', 'extended', 'maximum']
      }
    ]
  },
  {
    id: 'codex',
    displayName: 'Codex',
    icon: 'codex',
    subtitle: 'OpenAI coding agent',
    availableModels: [
      {
        id: 'gpt-5-codex',
        displayName: 'GPT-5 Codex',
        providerId: 'codex',
        supportedEffortLevels: [
          'light',
          'standard',
          'high',
          'extended',
          'maximum'
        ]
      },
      {
        id: 'gpt-5-mini',
        displayName: 'GPT-5 mini',
        providerId: 'codex',
        supportedEffortLevels: ['light', 'standard', 'high']
      }
    ]
  },
  {
    id: 'claude',
    displayName: 'Claude',
    icon: 'claude',
    subtitle: 'Anthropic coding agent',
    availableModels: [
      {
        id: 'claude-opus-4-6',
        displayName: 'Claude Opus 4.6',
        providerId: 'claude',
        supportedEffortLevels: ['standard', 'high', 'extended', 'maximum']
      },
      {
        id: 'claude-sonnet-4-5',
        displayName: 'Claude Sonnet 4.5',
        providerId: 'claude',
        supportedEffortLevels: ['light', 'standard', 'high']
      },
      {
        id: 'claude-haiku-4-5',
        displayName: 'Claude Haiku 4.5',
        providerId: 'claude',
        supportedEffortLevels: ['light']
      }
    ]
  }
];

/**
 * Builds a `ProviderRepository` backed by the mock catalog above. A factory (not
 * a module-level singleton) keeps the seam identical to the future IPC client.
 */
export function createMockProviderRepository(): ProviderRepository {
  return {
    listProviders() {
      return Promise.resolve(providers);
    }
  };
}
