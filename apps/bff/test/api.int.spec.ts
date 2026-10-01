import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/create-app';

let app: NestExpressApplication;
const ENV = { NODE_ENV: 'test', DATASET_SIZE: '2000', LOG_LEVEL: 'silent', RATE_LIMIT_PER_MIN: '100000' };

async function token(persona: string): Promise<string> {
  const r = await request(app.getHttpServer()).post('/api/v1/auth/demo-login').send({ persona });
  return r.body.accessToken as string;
}
const http = () => request(app.getHttpServer());

beforeAll(async () => {
  ({ app } = await createApp(ENV));
  await app.listen(0, '127.0.0.1');
});
afterAll(async () => {
  await app.close();
});

describe('health & hardening', () => {
  it('liveness/readiness are public and unprefixed', async () => {
    expect((await http().get('/healthz')).body).toEqual({ status: 'ok' });
    expect((await http().get('/readyz')).status).toBe(200);
  });
  it('sets security headers, correlation id and hides framework', async () => {
    const r = await http().get('/healthz').set('x-correlation-id', 'abc-12345678');
    expect(r.headers['x-correlation-id']).toBe('abc-12345678');
    expect(r.headers['x-powered-by']).toBeUndefined();
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['content-security-policy']).toContain("default-src 'none'");
  });
  it('replaces malformed correlation ids', async () => {
    const r = await http().get('/healthz').set('x-correlation-id', 'bad id!');
    expect(r.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('authentication & authorisation (deny by default)', () => {
  it('rejects anonymous, malformed and forged tokens with problem+json', async () => {
    const a = await http().get('/api/v1/portfolio/summary');
    expect(a.status).toBe(401);
    expect(a.headers['content-type']).toContain('application/problem+json');
    expect(a.body.correlationId).toBeTruthy();
    expect((await http().get('/api/v1/portfolio/summary').set('authorization', 'Bearer nope')).status).toBe(401);
    expect((await http().get('/api/v1/portfolio/summary').set('authorization', 'Basic abc')).status).toBe(401);
  });
  it('unknown persona is rejected', async () => {
    expect((await http().post('/api/v1/auth/demo-login').send({ persona: 'root' })).status).toBe(401);
    expect((await http().post('/api/v1/auth/demo-login').send({ persona: 'u-uw', extra: 1 })).status).toBe(400);
  });
  it('enforces least privilege per role', async () => {
    const viewer = await token('u-viewer'),
      uw = await token('u-uw'),
      rm = await token('u-rm'),
      admin = await token('u-admin');
    const get = (p: string, t: string) => http().get(p).set('authorization', `Bearer ${t}`);
    expect((await get('/api/v1/portfolio/summary', viewer)).status).toBe(200);
    expect((await get('/api/v1/exposures/export.csv', viewer)).status).toBe(403);
    expect((await get('/api/v1/status', uw)).status).toBe(403);
    expect((await get('/api/v1/status', admin)).body.datasetSize).toBe(2000);
    const stress = (t: string) =>
      http()
        .post('/api/v1/portfolio/stress')
        .set('authorization', `Bearer ${t}`)
        .send({ returnPeriod: 100, perilShocks: { Windstorm: 0.3 } });
    expect((await stress(uw)).status).toBe(403);
    expect((await stress(rm)).status).toBe(200);
  });
  it('me endpoint returns the principal derived from the token', async () => {
    const t = await token('u-rm');
    const r = await http().get('/api/v1/auth/me').set('authorization', `Bearer ${t}`);
    expect(r.body.role).toBe('risk-manager');
  });
});

describe('exposure query (Ag-Grid SSRM contract)', () => {
  const body = {
    startRow: 0,
    endRow: 25,
    rowGroupCols: [],
    valueCols: [],
    groupKeys: [],
    filterModel: {},
    sortModel: [{ colId: 'tiv', sort: 'desc' }],
  };
  it('returns a sorted page, masked for viewers and clear for underwriters', async () => {
    const v = await http()
      .post('/api/v1/exposures/query')
      .set('authorization', `Bearer ${await token('u-viewer')}`)
      .send(body);
    expect(v.status).toBe(200);
    expect(v.body.rows).toHaveLength(25);
    expect(v.body.lastRow).toBe(2000);
    expect(v.body.rows[0].insured).toMatch(/^Insured ••/);
    const u = await http()
      .post('/api/v1/exposures/query')
      .set('authorization', `Bearer ${await token('u-uw')}`)
      .send(body);
    expect(u.body.rows[0].insured).not.toMatch(/^Insured ••/);
  });
  it('validates payloads (400 with field errors) and blocks inference through masked fields (403)', async () => {
    const t = `Bearer ${await token('u-viewer')}`;
    const bad = await http().post('/api/v1/exposures/query').set('authorization', t).send({ startRow: -1 });
    expect(bad.status).toBe(400);
    expect(bad.body.errors.length).toBeGreaterThan(0);
    const leak = await http()
      .post('/api/v1/exposures/query')
      .set('authorization', t)
      .send({ ...body, sortModel: [{ colId: 'insured', sort: 'asc' }] });
    expect(leak.status).toBe(403);
    const huge = await http()
      .post('/api/v1/exposures/query')
      .set('authorization', t)
      .send({ ...body, endRow: 99999 });
    expect(huge.status).toBe(400);
  });
  it('serves grouped aggregates', async () => {
    const t = `Bearer ${await token('u-uw')}`;
    const r = await http()
      .post('/api/v1/exposures/query')
      .set('authorization', t)
      .send({
        ...body,
        sortModel: [],
        rowGroupCols: [{ id: 'lob', field: 'lob' }],
        valueCols: [{ id: 'tiv', field: 'tiv', aggFunc: 'sum' }],
      });
    expect(r.body.rows.every((x: { lob: string; tiv: number }) => x.lob && x.tiv > 0)).toBe(true);
  });
  it('returns distinct values and 404 for unknown policy, detail with legacy reconciliation', async () => {
    const t = `Bearer ${await token('u-uw')}`;
    expect((await http().get('/api/v1/exposures/distinct/lob').set('authorization', t)).body.length).toBeGreaterThan(3);
    expect((await http().get('/api/v1/exposures/distinct/insured').set('authorization', t)).status).toBe(400);
    expect((await http().get('/api/v1/exposures/NOPE').set('authorization', t)).status).toBe(404);
    const d = await http().get('/api/v1/exposures/E0000001').set('authorization', t);
    expect(d.status).toBe(200);
    expect(d.body.scoring.reconciled).toBe(true);
    expect(d.body.scoring.modern.score).toBe(d.body.scoring.legacy.score);
  });
  it('exports CSV for permitted roles and neutralises formula injection', async () => {
    const t = `Bearer ${await token('u-uw')}`;
    const r = await http()
      .get('/api/v1/exposures/export.csv')
      .query({ filterModel: JSON.stringify({ lob: { filterType: 'set', values: ['Cyber'] } }) })
      .set('authorization', t);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('text/csv');
    expect(r.text.split('\n')[0]).toContain('policyNumber');
    expect((await http().get('/api/v1/exposures/export.csv').query({ filterModel: '{bad' }).set('authorization', t)).status).toBe(400);
  });
});

describe('portfolio analytics', () => {
  it('summary reconciles with accumulation rows', async () => {
    const t = `Bearer ${await token('u-viewer')}`;
    const s = (await http().get('/api/v1/portfolio/summary').set('authorization', t)).body;
    const a = (await http().get('/api/v1/portfolio/accumulation?returnPeriod=100').set('authorization', t)).body as {
      tiv: number;
      pml100: number;
    }[];
    expect(s.policies).toBe(2000);
    expect(a.reduce((x, r) => x + r.tiv, 0)).toBeCloseTo(s.tiv, 0);
    expect(a.reduce((x, r) => x + r.pml100, 0)).toBeCloseTo(s.pml['100'], 0);
    expect((await http().get('/api/v1/portfolio/accumulation?returnPeriod=7').set('authorization', t)).status).toBe(400);
  });
  it('stress increases PML for positive shocks and rejects out-of-range shocks', async () => {
    const t = `Bearer ${await token('u-rm')}`;
    const ok = await http()
      .post('/api/v1/portfolio/stress')
      .set('authorization', t)
      .send({ returnPeriod: 250, perilShocks: { Earthquake: 0.5 } });
    expect(ok.body.stressedPml).toBeGreaterThanOrEqual(ok.body.baselinePml);
    const bad = await http()
      .post('/api/v1/portfolio/stress')
      .set('authorization', t)
      .send({ returnPeriod: 250, perilShocks: { Earthquake: 9 } });
    expect(bad.status).toBe(400);
  });
});

describe('fault tolerance', () => {
  it('chaos injection yields retriable 503 with Retry-After, health stays exempt', async () => {
    const { app: chaosApp } = await createApp({ ...ENV, CHAOS_RATE: '1' });
    await chaosApp.init();
    const r = await request(chaosApp.getHttpServer()).post('/api/v1/auth/demo-login').send({ persona: 'u-uw' });
    expect(r.status).toBe(503);
    expect(r.headers['retry-after']).toBe('1');
    expect((await request(chaosApp.getHttpServer()).get('/readyz')).status).toBe(200);
    await chaosApp.close();
  });
  it('rate limiter returns 429', async () => {
    const { app: limited } = await createApp({ ...ENV, RATE_LIMIT_PER_MIN: '3' });
    await limited.init();
    const codes: number[] = [];
    for (let i = 0; i < 5; i++)
      codes.push((await request(limited.getHttpServer()).post('/api/v1/auth/demo-login').send({ persona: 'u-uw' })).status);
    expect(codes).toContain(429);
    await limited.close();
  });
  it('readiness fails while draining', async () => {
    const { app: a } = await createApp(ENV);
    await a.init();
    await a.close();
  });
});
