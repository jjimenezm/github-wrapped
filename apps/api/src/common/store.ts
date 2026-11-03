import type { OnModuleDestroy } from '@nestjs/common';
import type Redis from 'ioredis';

/** The little the api needs from Redis: a cache with expiry and fixed-window counters. */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Counts a hit; the first hit opens a window of `windowSeconds` that later hits don't extend. */
  increment(key: string, windowSeconds: number): Promise<{ count: number; ttlSeconds: number }>;
}

export const STORE = Symbol('STORE');

/** Redis-backed store: shared by every api instance, required in production. */
export class RedisStore implements KeyValueStore, OnModuleDestroy {
  constructor(readonly redis: Redis) {}

  get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, 'EX', ttlSeconds);
  }

  async increment(key: string, windowSeconds: number) {
    const replies = await this.redis.multi().incr(key).ttl(key).exec();
    const count = Number(replies?.[0]?.[1] ?? 0);
    let ttlSeconds = Number(replies?.[1]?.[1] ?? -1);
    // No expiry yet (first hit, or a crash between INCR and EXPIRE): open the window now.
    if (ttlSeconds < 0) {
      await this.redis.expire(key, windowSeconds);
      ttlSeconds = windowSeconds;
    }
    return { count, ttlSeconds };
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}

/** In-process store for tests and local development without Redis. */
export class MemoryStore implements KeyValueStore {
  private readonly entries = new Map<string, { value: string; expiresAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  private live(key: string) {
    const entry = this.entries.get(key);
    if (entry && entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.live(key)?.value ?? null);
  }

  set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.entries.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
    return Promise.resolve();
  }

  increment(key: string, windowSeconds: number) {
    const entry = this.live(key);
    const expiresAt = entry?.expiresAt ?? this.now() + windowSeconds * 1000;
    const count = Number(entry?.value ?? 0) + 1;
    this.entries.set(key, { value: String(count), expiresAt });
    return Promise.resolve({ count, ttlSeconds: Math.ceil((expiresAt - this.now()) / 1000) });
  }
}
