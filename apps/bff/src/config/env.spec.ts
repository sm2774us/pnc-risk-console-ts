import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

describe('loadEnv', () => {
  it('applies safe development defaults', () => {
    const e = loadEnv({});
    expect(e.PORT).toBe(3000);
    expect(e.AUTH_MODE).toBe('demo');
    expect(e.corsOrigins).toEqual(['http://localhost:4200']);
  });
  it('rejects invalid values with readable messages', () => {
    expect(() => loadEnv({ PORT: 'abc' })).toThrow(/Invalid environment: PORT/);
    expect(() => loadEnv({ CHAOS_RATE: '2' })).toThrow(/CHAOS_RATE/);
  });
  it('refuses unsafe production configuration', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(/default JWT_SECRET/);
    const secret = 'x'.repeat(40);
    expect(() => loadEnv({ NODE_ENV: 'production', JWT_SECRET: secret })).toThrow(/AUTH_MODE=demo/);
    expect(() => loadEnv({ NODE_ENV: 'production', JWT_SECRET: secret, AUTH_MODE: 'jwt', CHAOS_RATE: '0.1' })).toThrow(/ALLOW_CHAOS/);
    expect(loadEnv({ NODE_ENV: 'production', JWT_SECRET: secret, AUTH_MODE: 'jwt' }).NODE_ENV).toBe('production');
  });
  it('splits CORS origins', () => {
    expect(loadEnv({ CORS_ORIGINS: 'https://a.example, https://b.example' }).corsOrigins).toHaveLength(2);
  });
});
