import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { APP_CONFIG, type AppConfig, type RateLimitName } from '../config';
import { STORE, type KeyValueStore } from './store';

const RATE_LIMIT = 'rateLimit';

/** Applies the named per-IP limit from the config to a route. */
export const RateLimit = (name: RateLimitName) => SetMetadata(RATE_LIMIT, name);

/**
 * Fixed-window limit per client IP, counted in the shared store. `req.ip` is the address the
 * proxy saw (trust proxy = 1 hop), so a forged X-Forwarded-For doesn't open a new window.
 */
@Injectable()
export class RateLimiter {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(STORE) private readonly store: KeyValueStore,
  ) {}

  /** Counts a hit; `retryAfter` is how long until the window reopens. */
  async hit(name: RateLimitName, ip: string): Promise<{ allowed: boolean; retryAfter: number }> {
    const rule = this.config.rateLimit[name];
    const { count, ttlSeconds } = await this.store.increment(
      `ratelimit:${name}:${ip}`,
      rule.windowSeconds,
    );
    return { allowed: count <= rule.max, retryAfter: ttlSeconds };
  }
}

/** API routes answer 429 with `Retry-After`; full-page navigations use RateLimiter directly. */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimiter,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const name = this.reflector.get<RateLimitName | undefined>(RATE_LIMIT, context.getHandler());
    if (!name) return true;
    const http = context.switchToHttp();
    const { allowed, retryAfter } = await this.limiter.hit(
      name,
      http.getRequest<Request>().ip ?? 'unknown',
    );
    if (allowed) return true;

    http.getResponse<Response>().setHeader('Retry-After', String(retryAfter));
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: 'RATE_LIMITED',
        message: 'Too many lookups from this address; try again later.',
        retryAfter,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
