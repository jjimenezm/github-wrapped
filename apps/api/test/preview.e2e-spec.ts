import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { WrapSnapshot } from '@wrapped/shared';
import { join } from 'node:path';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { CLOCK } from '../src/common/clock';
import { configureApp } from '../src/common/configure-app';
import { MemoryStore, STORE } from '../src/common/store';
import { APP_CONFIG, type AppConfig } from '../src/config';
import { GITHUB_TRANSPORT, type GithubTransport } from '../src/github/github.transport';

const config: AppConfig = {
  production: false,
  githubToken: null,
  fixturesDir: join(__dirname, 'fixtures/github'),
  redisUrl: null,
  rateLimit: { preview: { max: 5, windowSeconds: 600 } },
};

interface ErrorBody {
  code: string;
  retryAfter?: number;
}

describe('GET /api/preview/:login (e2e, GitHub fixtures)', () => {
  let app: INestApplication<App>;
  let now: Date;
  let githubCalls: jest.SpyInstance;

  beforeEach(async () => {
    now = new Date('2026-03-01T12:00:00Z');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CONFIG)
      .useValue(config)
      .overrideProvider(CLOCK)
      .useValue(() => now)
      .overrideProvider(STORE)
      .useValue(new MemoryStore(() => now.getTime()))
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    githubCalls = jest.spyOn(app.get<GithubTransport>(GITHUB_TRANSPORT), 'execute');
  });

  afterEach(() => app.close());

  const preview = (login: string) => request(app.getHttpServer()).get(`/api/preview/${login}`);
  const later = (minutes: number) => (now = new Date(now.getTime() + minutes * 60_000));

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

  it('builds last year in full when asked in January', async () => {
    now = new Date('2027-01-05T09:00:00Z');
    const res = await preview('ana-dev').expect(200);
    expect((res.body as WrapSnapshot).period).toEqual({
      year: 2026,
      from: '2026-01-01',
      to: '2026-12-31',
      complete: true,
    });
  });
});
