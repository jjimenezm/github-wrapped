import { DOCUMENT, mergeApplicationConfig, ApplicationConfig, inject } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { PUBLIC_BASE_URL } from './core/config/public-base-url';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    // Behind the proxy the request's own origin can be internal; previews need the public one.
    {
      provide: PUBLIC_BASE_URL,
      useFactory: () => process.env['PUBLIC_BASE_URL'] ?? inject(DOCUMENT).location.origin,
    },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
