import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import type { Express } from 'express';
import { DomainExceptionFilter } from './domain-exception.filter';

/**
 * What every api instance needs, in production and in e2e tests alike: routes under /api (Traefik
 * forwards that prefix as is), the client IP from exactly one proxy hop, session cookies, and
 * domain errors as HTTP.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  (app.getHttpAdapter().getInstance() as Express).set('trust proxy', 1);
  app.use(cookieParser());
  app.useGlobalFilters(new DomainExceptionFilter());
  app.enableShutdownHooks();
}
