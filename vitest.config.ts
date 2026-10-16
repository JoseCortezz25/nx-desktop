import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  // Mirror `tsconfig.json` `compilerOptions.paths` (`"@/*": ["./src/*"]`) so the
  // documented `@/shared/...` imports resolve in the test runner, not only under
  // `tsc`. The same alias is declared in `vite.config.ts` for the dev server.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}']
  }
});
