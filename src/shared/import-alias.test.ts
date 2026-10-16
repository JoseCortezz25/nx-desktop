/**
 * Guard for the documented `@/` import alias in the test runtime.
 *
 * `tsconfig.json` declares `compilerOptions.paths` (`"@/*": ["./src/*"]`) and the
 * project rules (`critical-constraints.md`, `file-structure.md`) require
 * consumers to import shared modules through `@/shared/...`. TypeScript and the
 * production bundle resolve that mapping on their own, so a missing runtime
 * alias stays invisible to `tsc`/`build` and only surfaces at dev/test runtime.
 *
 * This file imports the documented path exactly as a consumer would. If the
 * Vitest alias is removed, this suite fails to resolve and `pnpm test` goes red,
 * so the gap cannot be reintroduced silently.
 */
import { describe, expect, it } from 'vitest';
import { getSharedMessages } from '@/shared/i18n/messages';
import { sharedMessages } from './i18n/messages';

describe('shared module import alias', () => {
  it('resolves the documented `@/` path to the canonical module instance', () => {
    expect(getSharedMessages()).toBe(sharedMessages);
  });

  it('exposes shared copy through the aliased import', () => {
    expect(getSharedMessages().actions.save).toBe('Save');
  });
});
