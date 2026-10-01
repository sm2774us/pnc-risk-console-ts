import { resolve } from 'node:path';

/** Mirrors tsconfig.base.json `paths` so Vitest resolves workspace libraries. */
const root = import.meta.dirname;
export const workspaceAlias = {
  '@pnc/shared/domain': resolve(root, 'libs/shared/domain/src/index.ts'),
  '@pnc/shared/legacy-bridge': resolve(root, 'libs/shared/legacy-bridge/src/index.ts'),
};
