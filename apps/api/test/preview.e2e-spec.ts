import type { WrapSnapshot } from '@wrapped/shared';
import { createE2eApp, e2eConfig } from './e2e-app';

interface ErrorBody {
  code: string;
  retryAfter?: number;
}

describe('GET /api/preview/:login (e2e, GitHub fixtures)', () => {
  let t: Awaited<ReturnType<typeof createE2eApp>>;
  let githubCalls: jest.SpyInstance;

  beforeEach(async () => {
    t = await createE2eApp('2026-03-01T12:00:00Z');
    githubCalls = jest.spyOn(t.transport, 'execute');
  });

  afterEach(() => t.app.close());

  const preview = (login: string) => t.http().get(`/api/preview/${login}`);
  const later = (minutes: number) => t.later(minutes / 60);

  it('returns the snapshot of a normal person', async () => {
    const res = await preview('ana-dev').expect(200);
    const snapshot = res.body as WrapSnapshot;
    expect(snapshot.login).toBe('ana-dev');
    expect(snapshot.metrics).toEqual({
      contributions: 285,
      commits: 312,
      mergedPRs: 86,
      reviews: 41,
      issues: 19,
    });
    expect(snapshot.featured).toHaveLength(3);
    expect(snapshot.languages).toHaveLength(3);
    expect(snapshot.otherLanguagesBytes).toBe(40000);
    expect(snapshot.failedMetrics).toEqual([]);
  });

  it('normalizes @ and capitals to the same cached lookup', async () => {
    await preview('ana-dev').expect(200);
    const calls = githubCalls.mock.calls.length;
    const res = await preview(encodeURIComponent('@Ana-Dev')).expect(200);
    expect((res.body as WrapSnapshot).login).toBe('ana-dev');
    expect(githubCalls.mock.calls.length).toBe(calls);
  });

  it('serves a repeat lookup within the hour from the cache, and asks GitHub again after it', async () => {
    await preview('ana-dev').expect(200);
    const calls = githubCalls.mock.calls.length;
    later(59);
    await preview('ana-dev').expect(200);
    expect(githubCalls.mock.calls.length).toBe(calls);
    later(2);
    await preview('ana-dev').expect(200);
    expect(githubCalls.mock.calls.length).toBeGreaterThan(calls);
  });

  it('answers 404 USER_NOT_FOUND for a login that does not exist', async () => {
    const res = await preview('nadie-por-aqui').expect(404);
    expect((res.body as ErrorBody).code).toBe('USER_NOT_FOUND');
  });

  it('answers 400 INVALID_LOGIN for something that cannot be a login', async () => {
    const res = await preview('ana--dev').expect(400);
    expect((res.body as ErrorBody).code).toBe('INVALID_LOGIN');
  });

  it('hides merged PRs when their search fails, and retries GitHub within two minutes', async () => {
    const res = await preview('pr-falla').expect(200);
    const snapshot = res.body as WrapSnapshot;
    expect(snapshot.metrics.mergedPRs).toBeNull();
    expect(snapshot.failedMetrics).toEqual(['mergedPRs']);
    expect(snapshot.metrics.commits).toBe(312);
    const calls = githubCalls.mock.calls.length;
    later(3);
    await preview('pr-falla').expect(200);
    expect(githubCalls.mock.calls.length).toBeGreaterThan(calls);
  });

  it('caches a person without PRs for the full hour', async () => {
    const res = await preview('sin-prs').expect(200);
    expect((res.body as WrapSnapshot).metrics.mergedPRs).toBe(0);
    const calls = githubCalls.mock.calls.length;
    later(30);
    await preview('sin-prs').expect(200);
    expect(githubCalls.mock.calls.length).toBe(calls);
  });

  it('answers 503 with retryAfter when GitHub has no quota left', async () => {
    const res = await preview('sin-cuota').expect(503);
    expect(res.body as ErrorBody).toMatchObject({ code: 'GITHUB_RATE_LIMITED', retryAfter: 120 });
    expect(res.headers['retry-after']).toBe('120');
  });

  it('answers 429 once an IP uses up its lookups', async () => {
    for (let i = 0; i < 5; i++) await preview('ana-dev').expect(200);
    const res = await preview('ana-dev').expect(429);
    expect((res.body as ErrorBody).code).toBe('RATE_LIMITED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('keys the limit by the address the proxy saw, not by a forged X-Forwarded-For', async () => {
    const from = (client: string, forged: string) =>
      preview('ana-dev').set('X-Forwarded-For', `${forged}, ${client}`);
    for (let i = 0; i < 5; i++) await from('203.0.113.7', `198.51.100.${i}`).expect(200);
    await from('203.0.113.7', '198.51.100.99').expect(429);
    await from('203.0.113.8', '198.51.100.1').expect(200);
  });

  it('behind Cloudflare too (two hops), keys the limit by the client, not by the shared edge', async () => {
    await t.app.close();
    t = await createE2eApp('2026-03-01T12:00:00Z', e2eConfig({ trustProxyHops: 2 }));
    // Cloudflare appends the client it saw; Traefik appends the Cloudflare edge it saw.
    const edge = '172.70.1.1';
    const from = (client: string, forged: string) =>
      preview('ana-dev').set('X-Forwarded-For', `${forged}, ${client}, ${edge}`);
    for (let i = 0; i < 5; i++) await from('203.0.113.7', `198.51.100.${i}`).expect(200);
    await from('203.0.113.7', '198.51.100.99').expect(429);
    await from('203.0.113.8', '198.51.100.1').expect(200);
  });

  it('builds last year in full when asked in January', async () => {
    t.at('2027-01-05T09:00:00Z');
    const res = await preview('ana-dev').expect(200);
    expect((res.body as WrapSnapshot).period).toEqual({
      year: 2026,
      from: '2026-01-01',
      to: '2026-12-31',
      complete: true,
    });
  });
});
