import { defineConfig } from 'vitest/config';
import { workspaceAlias } from '../../../vitest.shared.mjs';
export default defineConfig({
  resolve: { alias: workspaceAlias },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*'],
      exclude: ['src/**/*.spec.ts', 'src/index.ts', 'src/**/*.d.ts'],
      thresholds: { lines: 90, functions: 90, branches: 80, statements: 90 },
    },
  },
});
