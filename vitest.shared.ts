import type { InlineConfig } from 'vitest/node';

export const oomSafeTestConfig = {
  pool: 'forks',
  maxWorkers: 4,
  isolate: true,
  exclude: ['dist/**/*', 'node_modules/**/*'],
} satisfies InlineConfig;
