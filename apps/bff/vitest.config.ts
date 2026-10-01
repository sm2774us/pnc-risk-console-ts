import { defineConfig } from 'vitest/config';
import { workspaceAlias } from '../../vitest.shared.mjs';
export default defineConfig({
  resolve: { alias: workspaceAlias },
  oxc: { decorator: { legacy: true } },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.int.spec.ts'],
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts'],
      thresholds: { lines: 85, functions: 85, branches: 75, statements: 85 },
    },
  },
});
