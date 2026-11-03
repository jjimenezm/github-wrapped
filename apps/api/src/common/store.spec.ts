import RedisMock from 'ioredis-mock';
import { MemoryStore, RedisStore, type KeyValueStore } from './store';

describe.each([
  ['MemoryStore', () => new MemoryStore()],
  ['RedisStore', () => new RedisStore(new RedisMock())],
])('%s', (_, create: () => KeyValueStore) => {
  let store: KeyValueStore;
  beforeEach(async () => {
    store = create();
    if (store instanceof RedisStore) await store.redis.flushall();
  });

  it('returns null for a missing key', async () => {
    expect(await store.get('missing')).toBeNull();
  });

  it('stores a value with a time to live', async () => {
    await store.set('k', 'v', 60);
    expect(await store.get('k')).toBe('v');
  });

  it('counts hits in a fixed window that the first hit opens', async () => {
    expect(await store.increment('hits', 600)).toEqual({ count: 1, ttlSeconds: 600 });
    const second = await store.increment('hits', 600);
    expect(second.count).toBe(2);
    expect(second.ttlSeconds).toBeLessThanOrEqual(600);
    expect(second.ttlSeconds).toBeGreaterThan(0);
  });
});

describe('MemoryStore expiry', () => {
  it('forgets values and windows once their time is up', async () => {
    let now = 0;
    const store = new MemoryStore(() => now);
    await store.set('k', 'v', 60);
    await store.increment('hits', 60);
    now = 61_000;
    expect(await store.get('k')).toBeNull();
    expect(await store.increment('hits', 60)).toEqual({ count: 1, ttlSeconds: 60 });
  });
});
