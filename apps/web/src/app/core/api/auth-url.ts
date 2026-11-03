import type { CardStyle, Locale } from '@wrapped/shared';
import { API_BASE } from './wrap-api.service';

/** What "Continuar con GitHub" asks the api to do once GitHub says who the person is. */
export type AuthRequest =
  | { intent: 'publish'; login: string; style: CardStyle; locale: Locale }
  | { intent: 'change-card'; login: string; style: CardStyle; year: number };

/**
 * The api's sign-in start. It is a full navigation, not a fetch: the api redirects to GitHub and
 * GitHub back to the api, which then lands on the share screen or on `/?oauth_error=…`.
 */
export function authUrl(request: AuthRequest): string {
  const query = new URLSearchParams({
    login: request.login,
    intent: request.intent,
    style: request.style,
    ...(request.intent === 'publish' ? { locale: request.locale } : { year: String(request.year) }),
  });
  return `${API_BASE}/auth/github?${query}`;
}
