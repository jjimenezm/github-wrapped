import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { HealthProbe } from '@wrapped/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { HEALTH_PROBES, HealthController } from './health.controller';

const probe = (name: string, works: boolean): HealthProbe => ({
  name,
  check: () => (works ? Promise.resolve() : Promise.reject(new Error(`${name} is down`))),
});

async function serve(probes: HealthProbe[]) {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [{ provide: HEALTH_PROBES, useValue: probes }],
  }).compile();
  const app: INestApplication<App> = moduleRef.createNestApplication({ logger: false });
  await app.init();
  return app;
}

describe('GET /health (api)', () => {
  let app: INestApplication<App>;
  afterEach(() => app.close());

  it('answers 200 with the state of Postgres and Redis', async () => {
    app = await serve([probe('postgres', true), probe('redis', true)]);
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    expect(response.body).toEqual({ status: 'ok', checks: { postgres: 'up', redis: 'up' } });
  });

  it('answers 503 naming Redis when Redis is down', async () => {
    app = await serve([probe('postgres', true), probe('redis', false)]);
    const response = await request(app.getHttpServer()).get('/health').expect(503);
    expect(response.body).toEqual({ status: 'error', checks: { postgres: 'up', redis: 'down' } });
  });

  it('answers 503 naming Postgres when Postgres is down', async () => {
    app = await serve([probe('postgres', false), probe('redis', true)]);
    const response = await request(app.getHttpServer()).get('/health').expect(503);
    expect((response.body as { checks: unknown }).checks).toEqual({
      postgres: 'down',
      redis: 'up',
    });
  });

  it('is never cached, so a monitor behind a CDN sees the live state', async () => {
    app = await serve([probe('postgres', true), probe('redis', true)]);
    const response = await request(app.getHttpServer()).get('/health');
    expect(response.headers['cache-control']).toBe('no-store');
  });
});
