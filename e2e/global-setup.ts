import { request, type APIRequestContext } from '@playwright/test';
import { ANA, BETO } from './fixtures/people';
import { API } from './servers';

/**
 * Publishes through the real sign-in, skipping only GitHub: start → (GitHub) → callback with a
 * fixture code. Returns the context, which now holds that person's session.
 */
async function publish(
  person: { id: number; login: string },
  choice: { style: string; locale: string },
): Promise<APIRequestContext> {
  const context = await request.newContext({ baseURL: API });
  const start = await context.get('/api/auth/github', {
    params: { login: person.login, intent: 'publish', ...choice },
    maxRedirects: 0,
  });
  const state = new URL(start.headers()['location'] ?? '').searchParams.get('state') ?? '';
  const callback = await context.get('/api/auth/github/callback', {
    params: { code: `fixture:${person.id}:${person.login}`, state },
    maxRedirects: 0,
  });
  if (!callback.headers()['location']?.endsWith('/share')) {
    throw new Error(`Publishing ${person.login} failed: ${callback.headers()['location']}`);
  }
  return context;
}

/** @ana-dev published in English (a Spanish browser still reads it in English); @beto deleted. */
export default async function globalSetup(): Promise<void> {
  const ana = await publish(ANA, { style: 'cordillera', locale: 'en' });
  await ana.dispose();
  const beto = await publish(BETO, { style: 'huella', locale: 'es' });
  const deleted = await beto.delete(`/api/wraps/${BETO.login}/2026`);
  if (deleted.status() !== 204) throw new Error(`Deleting ${BETO.login}: ${deleted.status()}`);
  await beto.dispose();
}
