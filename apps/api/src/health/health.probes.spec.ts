import type { PrismaClient } from '@prisma/client';
import RedisMock from 'ioredis-mock';
import { MemoryStore, RedisStore } from '../common/store';
import { PrismaWrapsRepository } from '../wraps/prisma-wraps.repository';
import { InMemoryWrapsRepository } from '../wraps/wraps.repository';
import { healthProbes } from './health.probes';

/** Just enough of PrismaClient for a ping: a raw query that works or fails. */
const fakePrisma = (works: boolean) =>
  ({
    $queryRaw: () => (works ? Promise.resolve([{ ok: 1 }]) : Promise.reject(new Error('P1001'))),
  }) as unknown as PrismaClient;

describe('healthProbes', () => {
  it('checks Postgres and Redis when the api runs on them', () => {
    const probes = healthProbes(
      new PrismaWrapsRepository(fakePrisma(true)),
      new RedisStore(new RedisMock()),
    );
    expect(probes.map((p) => p.name)).toEqual(['postgres', 'redis']);
  });

  it('pings Postgres with a query', async () => {
    const [ok] = healthProbes(new PrismaWrapsRepository(fakePrisma(true)), new MemoryStore());
    const [broken] = healthProbes(new PrismaWrapsRepository(fakePrisma(false)), new MemoryStore());
    await expect(ok.check()).resolves.toBeUndefined();
    await expect(broken.check()).rejects.toThrow('P1001');
  });

  it('pings Redis', async () => {
    const [redis] = healthProbes(new InMemoryWrapsRepository(), new RedisStore(new RedisMock()));
    expect(redis.name).toBe('redis');
    await expect(redis.check()).resolves.toBeUndefined();
  });

  it('has nothing to check when everything lives in memory (tests, local development)', () => {
    expect(healthProbes(new InMemoryWrapsRepository(), new MemoryStore())).toEqual([]);
  });
});
