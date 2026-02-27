import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@scorecraft/core': new URL('./packages/core/src/index.ts', import.meta.url).pathname,
      '@scorecraft/midi': new URL('./packages/midi/src/index.ts', import.meta.url).pathname,
      '@scorecraft/ui': new URL('./packages/ui/src/index.ts', import.meta.url).pathname,
      '@scorecraft/engraving': new URL('./packages/engraving/src/index.ts', import.meta.url).pathname,
    },
  },
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 85,
        branches: 85,
        functions: 85,
        statements: 85,
      },
    },
  },
});
