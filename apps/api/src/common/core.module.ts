import { Global, Logger, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { APP_CONFIG, loadConfig, type AppConfig } from '../config';
import { CLOCK, type Clock } from './clock';
import { RateLimitGuard, RateLimiter } from './rate-limit.guard';
import { MemoryStore, RedisStore, STORE, type KeyValueStore } from './store';

/** Config, clock and the shared store, available to every module. */
@Global()
@Module({
  providers: [
    { provide: APP_CONFIG, useFactory: () => loadConfig(process.env) },
    { provide: CLOCK, useValue: (() => new Date()) satisfies Clock },
    {
      provide: STORE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): KeyValueStore => {
        if (config.redisUrl) return new RedisStore(new Redis(config.redisUrl));
        new Logger('CoreModule').warn('REDIS_URL is not set: using an in-memory store');
        return new MemoryStore();
      },
    },
    RateLimiter,
    RateLimitGuard,
  ],
  exports: [APP_CONFIG, CLOCK, STORE, RateLimiter, RateLimitGuard],
})
export class CoreModule {}
