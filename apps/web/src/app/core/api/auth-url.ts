import type { CardStyle, Locale } from '@wrapped/shared';
import { API_BASE } from './wrap-api.service';

/**
 * What "Continuar con GitHub" asks the api to do once GitHub says who the person is. `manage`
 * only opens a session, for the share screen's actions when the previous one expired.
 */
export type AuthRequest =
  | { intent: 'publish'; login: string; style: CardStyle; locale: Locale }
  | { intent: 'change-card'; login: string; style: CardStyle; year: number }
  | { intent: 'manage'; login: string; year: number };

/**
 * The api's sign-in start. It is a full navigation, not a fetch: the api redirects to GitHub and
 * GitHub back to the api, which then lands on the share screen or on `/?oauth_error=…`.
 */
export function authUrl(request: AuthRequest): string {
  const query = new URLSearchParams({ login: request.login, intent: request.intent });
  if (request.intent !== 'manage') query.set('style', request.style);
  if (request.intent === 'publish') query.set('locale', request.locale);
  else query.set('year', String(request.year));
  return `${API_BASE}/auth/github?${query}`;
}
