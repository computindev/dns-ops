import { defineConfig } from 'vitest/config';
import { oomSafeTestConfig } from '../../vitest.shared.js';

export default defineConfig({
  test: {
    ...oomSafeTestConfig,
    include: ['src/**/*.test.ts'],
  },
});
