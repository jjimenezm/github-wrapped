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

describe('GET /health (renderer)', () => {
  let app: INestApplication<App>;
  afterEach(() => app.close());

  it('answers 200 when Redis answers and the volume takes writes', async () => {
    app = await serve([probe('redis', true), probe('volume', true)]);
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    expect(response.body).toEqual({ status: 'ok', checks: { redis: 'up', volume: 'up' } });
  });

  it('answers 503 naming the volume when it is missing', async () => {
    app = await serve([probe('redis', true), probe('volume', false)]);
    const response = await request(app.getHttpServer()).get('/health').expect(503);
    expect(response.body).toEqual({ status: 'error', checks: { redis: 'up', volume: 'down' } });
  });

  it('answers 503 naming Redis when the queue is unreachable', async () => {
    app = await serve([probe('redis', false), probe('volume', true)]);
    const response = await request(app.getHttpServer()).get('/health').expect(503);
    expect((response.body as { checks: unknown }).checks).toEqual({ redis: 'down', volume: 'up' });
  });
});
