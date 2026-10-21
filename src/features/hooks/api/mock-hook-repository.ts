/**
 * In-memory hook fixture behind the mock port and its tests. The running app
 * reads the IPC-backed repository (#24).
 */
import type { Hook } from '@/shared/domain/hook.types';
import type { HookRepository } from './hook-repository';

/** Provider-style fixture data, not executable instructions for this UI. */
const DEFAULT_HOOKS: readonly Hook[] = [
  {
    id: 'hook-lint-on-write',
    name: 'Lint on write',
    isNew: true,
    origin: 'Configuración del proyecto',
    hookType: 'PreToolUse',
    command: 'node .claude/hooks/lint-on-write.mjs',
    timeoutMs: 5000,
    approvalStatus: 'pending'
  },
  {
    id: 'hook-prettier-on-save',
    name: 'Prettier on save',
    isNew: false,
    origin: 'Configuración del proyecto',
    hookType: 'PostToolUse',
    command: 'node .claude/hooks/prettier-on-save.mjs',
    timeoutMs: 5000,
    approvalStatus: 'pending'
  },
  {
    id: 'hook-block-secrets',
    name: 'Block secrets in commands',
    isNew: true,
    origin: 'Configuración de usuario',
    hookType: 'PreToolUse',
    command: 'node ~/.claude/hooks/block-secrets.mjs',
    timeoutMs: 1500,
    approvalStatus: 'pending'
  },
  {
    id: 'hook-guard-force-push',
    name: 'Guard force push',
    isNew: true,
    origin: 'Configuración de usuario',
    hookType: 'PreToolUse',
    command: 'node ~/.claude/hooks/guard-force-push.mjs',
    timeoutMs: 1500,
    approvalStatus: 'pending'
  },
  {
    id: 'hook-type-check',
    name: 'Type-check before commit',
    isNew: true,
    origin: 'Configuración del proyecto',
    hookType: 'PreToolUse',
    command: 'pnpm run typecheck',
    timeoutMs: 30000,
    approvalStatus: 'pending'
  },
  {
    id: 'hook-notify-tool-use',
    name: 'Notify on tool use',
    isNew: false,
    origin: 'Complemento',
    hookType: 'PostToolUse',
    command: 'node plugins/notifications/tool-use.mjs',
    timeoutMs: 1500,
    approvalStatus: 'pending'
  }
];

export function createMockHookRepository(
  options: { hooks?: readonly Hook[] } = {}
): HookRepository {
  let hooks = options.hooks ?? DEFAULT_HOOKS;
  return {
    listHooks: async () => hooks,
    setHookDecision: async (hookId, approvalStatus) => {
      const hook = hooks.find(candidate => candidate.id === hookId);
      if (!hook) {
        throw new Error(`unknown hook: ${hookId}`);
      }
      const stored: Hook = { ...hook, approvalStatus };
      hooks = hooks.map(candidate =>
        candidate.id === hookId ? stored : candidate
      );
      return stored;
    }
  };
}
