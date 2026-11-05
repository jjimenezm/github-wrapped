import type { Page } from '@playwright/test';
import { WEB } from '../servers';
import type { Person } from './people';

/** A 1×1 PNG: what an avatar from GitHub's CDN becomes, so no test depends on the network. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

/** Everything outside the local web and api: images get a blank pixel, the rest is refused. */
export async function stayOffline(page: Page): Promise<void> {
  await page.route(
    (url) => url.hostname !== 'localhost',
    (route) =>
      route.request().resourceType() === 'image'
        ? route.fulfill({ contentType: 'image/png', body: PIXEL })
        : route.abort(),
  );
}

/**
 * Plays GitHub as `person`: the api's sign-in start runs for real (state and nonce cookie),
 * but its redirect skips github.com and goes straight back to the callback with a fixture code.
 * The browser follows redirects without asking routes, so the start is where to step in.
 */
export async function signInOnGitHubAs(page: Page, person: Person): Promise<void> {
  await page.route('https://github.com/**', (route) => route.abort());
  await page.route('**/api/auth/github?*', async (route) => {
    const response = await route.fetch({ maxRedirects: 0 });
    const github = new URL(response.headers()['location'] ?? '');
    const state = github.searchParams.get('state') ?? '';
    const code = `fixture:${person.id}:${person.login}`;
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        location: `${WEB}/api/auth/github/callback?code=${code}&state=${state}`,
      },
    });
  });
}
