import { defineConfig } from 'vitest/config';
import { oomSafeTestConfig } from './vitest.shared.js';

export default defineConfig({
  test: {
    ...oomSafeTestConfig,
    include: [
      'packages/*/src/**/*.test.ts',
      'apps/*/src/**/*.test.ts',
      'apps/web/hono/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
    // Disable module caching to ensure fresh state in each test
    cache: false,
  },
});
