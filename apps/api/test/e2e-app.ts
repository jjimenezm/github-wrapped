import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { CLOCK } from '../src/common/clock';
import { configureApp } from '../src/common/configure-app';
import { MemoryStore, STORE } from '../src/common/store';
import { APP_CONFIG, type AppConfig } from '../src/config';
import { GITHUB_TRANSPORT, type GithubTransport } from '../src/github/github.transport';
import { RENDER_QUEUE, type InMemoryRenderQueue } from '../src/render/render-queue';
import { WRAPS_REPOSITORY, type InMemoryWrapsRepository } from '../src/wraps/wraps.repository';

export const e2eConfig = (overrides: Partial<AppConfig> = {}): AppConfig => ({
  production: false,
  githubToken: null,
  fixturesDir: join(__dirname, 'fixtures/github'),
  redisUrl: null,
  databaseUrl: null,
  publicBaseUrl: 'http://localhost:4200',
  apiBaseUrl: 'http://localhost:3000',
  filesDir: mkdtempSync(join(tmpdir(), 'wrapped-e2e-')),
  sessionSecret: 'e2e-session-secret-that-is-long-enough',
  oauth: { clientId: null, clientSecret: null },
  rateLimit: {
    preview: { max: 5, windowSeconds: 600 },
    publish: { max: 20, windowSeconds: 3600 },
  },
  ...overrides,
});

/** The real AppModule over GitHub fixtures, in-memory storage and a clock the test moves. */
export async function createE2eApp(start: string, config: AppConfig = e2eConfig()) {
  let now = new Date(start);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(APP_CONFIG)
    .useValue(config)
    .overrideProvider(CLOCK)
    .useValue(() => now)
    .overrideProvider(STORE)
    .useValue(new MemoryStore(() => now.getTime()))
    .compile();
  const app: INestApplication<App> = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return {
    app,
    http: () => request(app.getHttpServer()),
    agent: () => request.agent(app.getHttpServer()),
    transport: app.get<GithubTransport>(GITHUB_TRANSPORT),
    repo: app.get<InMemoryWrapsRepository>(WRAPS_REPOSITORY),
    queue: app.get<InMemoryRenderQueue>(RENDER_QUEUE),
    at: (iso: string) => (now = new Date(iso)),
    later: (hours: number) => (now = new Date(now.getTime() + hours * 3_600_000)),
  };
}
