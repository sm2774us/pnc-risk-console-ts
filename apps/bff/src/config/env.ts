import { z } from 'zod';

export const APP_ENV = Symbol('APP_ENV');
const DEV_SECRET = 'dev-only-secret-change-me-0123456789abcdef';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  AUTH_MODE: z.enum(['demo', 'jwt']).default('demo'),
  JWT_SECRET: z.string().min(32).default(DEV_SECRET),
  JWT_ISSUER: z.string().default('pnc-risk-console'),
  JWT_AUDIENCE: z.string().default('pnc-risk-console-web'),
  JWT_TTL_SEC: z.coerce.number().int().min(60).max(86_400).default(3600),
  CORS_ORIGINS: z.string().default('http://localhost:4200'),
  DATASET_SIZE: z.coerce.number().int().min(100).max(1_000_000).default(50_000),
  DATASET_SEED: z.coerce.number().int().default(20261001),
  CHAOS_RATE: z.coerce.number().min(0).max(1).default(0),
  ALLOW_CHAOS: z.enum(['true', 'false']).default('false'),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(100).default(10_000),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(600),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  APP_VERSION: z.string().default('1.0.0'),
});

export type Env = z.infer<typeof schema> & { corsOrigins: string[] };

/** Parses and hardens configuration. Fails fast (process exit) rather than starting in an unsafe state. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production') {
    if (env.JWT_SECRET === DEV_SECRET) throw new Error('Refusing to start: default JWT_SECRET is not allowed in production');
    if (env.AUTH_MODE === 'demo') throw new Error('Refusing to start: AUTH_MODE=demo is not allowed in production');
    if (env.CHAOS_RATE > 0 && env.ALLOW_CHAOS !== 'true') throw new Error('Refusing to start: CHAOS_RATE requires ALLOW_CHAOS=true');
  }
  return {
    ...env,
    corsOrigins: env.CORS_ORIGINS.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
