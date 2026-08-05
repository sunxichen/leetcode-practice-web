import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // .mjs is included because the deck validator must be runnable by plain
    // node in the build script, with no compile step — so it and its tests are
    // authored as ESM JavaScript rather than TypeScript.
    include: ['**/*.test.ts', '**/*.test.mjs'],
  },
});
