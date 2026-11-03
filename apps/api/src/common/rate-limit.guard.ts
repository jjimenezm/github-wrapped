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
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(STORE) private readonly store: KeyValueStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const name = this.reflector.get<RateLimitName | undefined>(RATE_LIMIT, context.getHandler());
    if (!name) return true;
    const rule = this.config.rateLimit[name];
    const http = context.switchToHttp();
    const ip = http.getRequest<Request>().ip ?? 'unknown';
    const { count, ttlSeconds } = await this.store.increment(
      `ratelimit:${name}:${ip}`,
      rule.windowSeconds,
    );
    if (count <= rule.max) return true;

    http.getResponse<Response>().setHeader('Retry-After', String(ttlSeconds));
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: 'RATE_LIMITED',
        message: 'Too many lookups from this address; try again later.',
        retryAfter: ttlSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
