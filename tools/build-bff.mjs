// Bundles the NestJS BFF into ONE ESM file so the runtime image needs no node_modules (minimal attack surface).
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';

const outdir = 'dist/apps/bff';
mkdirSync(outdir, { recursive: true });

// Optional Nest peers that are lazily required inside try/catch; never present at runtime.
const optional = [
  '@nestjs/websockets',
  '@nestjs/websockets/*',
  '@nestjs/microservices',
  '@nestjs/microservices/*',
  '@nestjs/platform-fastify',
  '@fastify/static',
  '@fastify/view',
  'class-validator',
  'class-transformer',
  'cache-manager',
  '@nestjs/mapped-types',
];

const result = await build({
  entryPoints: ['apps/bff/src/main.ts'],
  outfile: `${outdir}/main.mjs`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  minify: false,
  tsconfig: 'apps/bff/tsconfig.app.json',
  external: optional,
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  legalComments: 'linked',
  metafile: true,
  logLevel: 'info',
});
writeFileSync(`${outdir}/package.json`, JSON.stringify({ type: 'module' }));
const kb = Object.values(result.metafile.outputs).reduce((s, o) => s + o.bytes, 0) / 1024;
console.log(`bff bundle ready: ${(kb / 1024).toFixed(1)} MB (incl. sourcemap)`);
