import { DOCUMENT, InjectionToken, inject } from '@angular/core';

/**
 * Where public pages live (`https://wrapped.jjimenezm.dev` in production): the base the cards
 * print and encode. The web and its public pages share an origin, so the page's own origin.
 */
export const PUBLIC_BASE_URL = new InjectionToken<string>('PUBLIC_BASE_URL', {
  providedIn: 'root',
  factory: () => inject(DOCUMENT).location?.origin ?? '',
});
