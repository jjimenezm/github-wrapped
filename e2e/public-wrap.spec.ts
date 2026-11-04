import { expect, test, type Page } from '@playwright/test';
import { ANA, BETO, WEB } from './servers';

const PAGE = `/@${ANA.login}/2026`;
const SPANISH = { 'Accept-Language': 'es-CL,es;q=0.9' };

test.describe('the public page, from the server', () => {
  test('is rendered on the server in the wrap’s language, with link-preview tags', async ({
    request,
  }) => {
    const response = await request.get(PAGE, { headers: SPANISH });

    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain('ng-server-context="ssr"');
    expect(html).toMatch(/<html[^>]*\slang="en"/);
    expect(html).toContain(`<meta property="og:title" content="@${ANA.login}`);
    expect(html).toContain(`<meta property="og:url" content="${WEB}${PAGE}"`);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image"');
    expect(html).toContain('See my year');
  });

  test('answers 410 for a deleted wrap', async ({ request }) => {
    const response = await request.get(`/@${BETO.login}/2026`, { headers: SPANISH });

    expect(response.status()).toBe(410);
    expect(await response.text()).toContain('Este wrap ya no está disponible');
  });

  test('answers 404 for a login that never published, with a link to create it', async ({
    request,
  }) => {
    const response = await request.get('/@nadie/2026', { headers: SPANISH });

    expect(response.status()).toBe(404);
    const html = await response.text();
    expect(html).toContain('@nadie todavía no tiene su wrap 2026');
    expect(html).toContain('href="/?login=nadie"');
  });

  test('leaves every other screen to the browser', async ({ request }) => {
    for (const path of ['/', `${PAGE}/slides`]) {
      const html = await (await request.get(path)).text();
      expect(html, path).not.toContain('ng-server-context="ssr"');
    }
  });
});

test.describe('the public page, in a Spanish browser on a computer', () => {
  test.use({ locale: 'es-CL', viewport: { width: 1440, height: 900 } });

  /** Every console error and Angular warning (NG0500… are hydration mismatches). */
  function problems(page: Page): string[] {
    const found: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' || /NG0\d{3}/.test(message.text())) found.push(message.text());
    });
    page.on('pageerror', (error) => found.push(error.message));
    return found;
  }

  test('hydrates in the wrap’s language, without hydration errors', async ({ page }) => {
    const found = problems(page);
    const hydrated = page.waitForEvent('console', (m) => m.text().includes('Angular hydrated'));

    await page.goto(PAGE);
    await hydrated;

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('link', { name: 'See my year' })).toBeVisible();
    await expect(page.locator('video')).toHaveCount(0);
    expect(found).toEqual([]);
  });

  test('shows the card first; "See my year" opens the slides and comes back', async ({ page }) => {
    await page.goto(PAGE);
    const card = await page.locator('.card').boundingBox();
    const see = await page.getByRole('link', { name: 'See my year' }).boundingBox();
    expect(card && see && card.y < see.y).toBe(true);

    await page.getByRole('link', { name: 'See my year' }).click();
    await expect(page).toHaveURL(`${PAGE}/slides`);
    // One arrow per slide after the first; then the last step leads back.
    const slides = await page.locator('.segments li').count();
    for (let i = 1; i < slides; i++) await page.keyboard.press('ArrowRight');
    await page.getByRole('button', { name: 'Back to the card' }).click();

    await expect(page).toHaveURL(PAGE);
    await expect(page.getByRole('link', { name: 'See my year' })).toBeVisible();
  });

  test('"Make yours" goes to the entry, back in the visitor’s language', async ({ page }) => {
    await page.goto(PAGE);

    await page.getByRole('link', { name: 'Make yours' }).click();

    await expect(page).toHaveURL(`${WEB}/`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Tu año en GitHub, en 30 segundos',
    );
  });

  /**
   * Plays GitHub as `person`: the api's sign-in start runs for real (state and nonce cookie),
   * but its redirect skips github.com and goes straight back to the callback with a fixture code.
   * The browser follows redirects without asking routes, so the start is where to step in.
   */
  async function signInOnGitHubAs(page: Page, person: { id: number; login: string }) {
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

  test('"Yours? Manage" takes the owner to the share screen', async ({ page }) => {
    await signInOnGitHubAs(page, ANA);
    await page.goto(PAGE);

    await page.getByRole('link', { name: 'Yours? Manage' }).click();

    await expect(page).toHaveURL(`${PAGE}/share`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Listo para compartir');
  });

  test('another account comes back to the page with a notice', async ({ page }) => {
    await signInOnGitHubAs(page, BETO);
    await page.goto(PAGE);

    await page.getByRole('link', { name: 'Yours? Manage' }).click();

    await expect(page).toHaveURL(`${PAGE}?oauth_error=WRONG_ACCOUNT`);
    await expect(page.getByRole('status')).toContainText(`That GitHub account isn’t @${ANA.login}`);
  });
});
