import { defineConfig } from 'vitest/config';
import { workspaceAlias } from '../../vitest.shared.mjs';
export default defineConfig({
  resolve: { alias: workspaceAlias },
  oxc: { decorator: { legacy: true } },
  test: { environment: 'node', include: ['test/**/*.int.spec.ts'], testTimeout: 30_000, hookTimeout: 30_000 },
});
