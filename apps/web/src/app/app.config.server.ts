import { HttpBackend } from '@angular/common/http';
import {
  DOCUMENT,
  mergeApplicationConfig,
  ApplicationConfig,
  inject,
  type Provider,
} from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { API_INTERNAL_URL, InternalApiBackend } from './core/api/internal-api.backend';
import { PUBLIC_BASE_URL } from './core/config/public-base-url';

// In production the api is another container (the e2e suite sets it too); unset (plain ng serve),
// /api goes through the proxy.
const apiInternalUrl = process.env['API_INTERNAL_URL'];
const internalApi: Provider[] = apiInternalUrl
  ? [
      { provide: API_INTERNAL_URL, useValue: apiInternalUrl },
      { provide: HttpBackend, useClass: InternalApiBackend },
    ]
  : [];

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    // Behind the proxy the request's own origin can be internal; previews need the public one.
    {
      provide: PUBLIC_BASE_URL,
      useFactory: () => process.env['PUBLIC_BASE_URL'] ?? inject(DOCUMENT).location.origin,
    },
    ...internalApi,
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
