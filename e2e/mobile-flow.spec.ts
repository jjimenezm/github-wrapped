import { expect, test, type Page } from '@playwright/test';
import { signInOnGitHubAs, stayOffline } from './fixtures/github';
import { ANA, LIAM, NICO, PR_FALLA, SOFIA, type Person } from './fixtures/people';
import { readQr } from './fixtures/qr';
import { WEB } from './servers';

/**
 * The whole journey on a phone, the way a person makes and shares their wrap: entry → loading →
 * slides → choose a card → publish with GitHub → share screen → public page → delete. GitHub's
 * data and sign-in come from fixtures; nothing renders the PNGs, so the image actions stay in
 * their "getting ready" state.
 */

/** What each language prints on the way; every journey starts in a Spanish phone. */
const COPY = {
  es: {
    title: 'Tu año en GitHub, en 30 segundos',
    field: 'Usuario de GitHub',
    create: 'Crear mi wrap',
    searching: 'Buscando tu actividad pública…',
    next: 'Siguiente',
    choose: 'Elegir mi tarjeta',
    cards: 'Tu wrap está listo',
    publish: 'Continuar con GitHub para publicar',
    share: 'Listo para compartir',
    card: (style: string) => `Tu tarjeta ${style}`,
    copy: 'Copiar enlace',
    copied: 'Enlace copiado',
    preparing: (action: string) => new RegExp(`^${action}\\b.*preparando$`),
    image: 'Imagen',
    seeYear: 'Ver mi año',
    remove: 'Eliminar mi wrap',
    confirm: (year: number) => `¿Eliminar tu wrap ${year}?`,
    removeNow: 'Eliminar wrap',
    removed: (year: number) => `Eliminamos tu wrap ${year}. El link y el QR ya no funcionan.`,
    gone: 'Este wrap ya no está disponible',
    mergedPRs: 'PRs mergeados',
  },
  en: {
    title: 'Your year on GitHub, in 30 seconds',
    field: 'GitHub username',
    create: 'Create my wrap',
    searching: 'Looking up your public activity…',
    next: 'Next',
    choose: 'Choose my card',
    cards: 'Your wrap is ready',
    publish: 'Continue with GitHub to publish',
    share: 'Ready to share',
    card: (style: string) => `Your ${style} card`,
    copy: 'Copy link',
    copied: 'Link copied',
    preparing: (action: string) => new RegExp(`^${action}\\b.*getting ready$`),
    image: 'Image',
    seeYear: 'See my year',
    remove: 'Delete my wrap',
    confirm: (year: number) => `Delete your ${year} wrap?`,
    removeNow: 'Delete wrap',
    removed: (year: number) => `Your ${year} wrap was deleted. The link and the QR no longer work.`,
    gone: 'This wrap is no longer available',
    mergedPRs: 'merged PRs',
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

test.use({ locale: 'es-CL', permissions: ['clipboard-read', 'clipboard-write'] });

test.beforeEach(async ({ page }) => stayOffline(page));

/** Screens 1 and 2: the login typed with its @, the loader, then the first slide. */
async function lookUp(page: Page, person: Person, copy: Copy): Promise<void> {
  await page.getByLabel(copy.field).fill(`@${person.login}`);
  await page.getByRole('button', { name: copy.create }).click();

  await expect(page.getByText(`@${person.login}`)).toBeVisible();
  await expect(page.getByText(copy.searching)).toBeVisible();
  await expect(page).toHaveURL(`${WEB}/slides`);
}

/** Through the remaining slides to the cards, the way a thumb does it: the button at the bottom. */
async function toTheCards(page: Page, copy: Copy): Promise<void> {
  const segments = await page
    .locator('.segments li')
    .evaluateAll((items) => items.map((item) => item.getAttribute('aria-current')));
  for (let i = segments.indexOf('step') + 1; i < segments.length; i++) {
    await page.getByRole('button', { name: copy.next }).click();
  }
  await page.getByRole('button', { name: copy.choose }).click();

  await expect(page).toHaveURL(`${WEB}/publish`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.cards);
}

/** The year the wrap will be published under, as the cards screen announces it. */
async function announcedYear(page: Page, person: Person): Promise<number> {
  const fine = await page.locator('.fine').textContent();
  const year = new RegExp(`/@${person.login}/(\\d{4})`).exec(fine ?? '')?.[1];
  if (!year) throw new Error(`No public path for @${person.login} in "${fine}"`);
  return Number(year);
}

/** Publishes as `person` and lands on the share screen; returns where the wrap now lives. */
async function publish(
  page: Page,
  person: Person,
  copy: Copy,
): Promise<{ path: string; year: number }> {
  const year = await announcedYear(page, person);
  const path = `/@${person.login}/${year}`;
  await signInOnGitHubAs(page, person);
  await page.getByRole('button', { name: copy.publish }).click();

  await expect(page).toHaveURL(`${WEB}${path}/share`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.share);
  return { path, year };
}

interface Journey {
  name: string;
  person: Person;
  language: keyof typeof COPY;
  /** The language picked on the entry, or null to keep the phone's. */
  switchTo: 'EN' | null;
  /** The card chosen in the carousel, by its name on screen. */
  style: string;
  /** Contributions, as the first slide's big number ends up. */
  total: string;
  metrics: number;
  /** Featured repos in order; the first one has a demo. Empty: no projects slide. */
  projects: string[];
}

const JOURNEYS: Journey[] = [
  {
    name: 'in Spanish',
    person: SOFIA,
    language: 'es',
    switchTo: null,
    style: 'Constelación',
    total: '1.284',
    metrics: 5,
    projects: ['buses-rm', 'cobre'],
  },
  {
    name: 'in English, switched to on a Spanish phone',
    person: LIAM,
    language: 'en',
    switchTo: 'EN',
    style: 'Ridgeline',
    total: '2,048',
    metrics: 4,
    projects: [],
  },
];

for (const journey of JOURNEYS) {
  test(`the whole journey ${journey.name}, from the entry to deleting the wrap`, async ({
    page,
  }) => {
    const { person, language } = journey;
    const copy = COPY[language];

    await test.step('entry and loading', async () => {
      await page.goto('/');
      if (journey.switchTo) {
        await page.getByRole('button', { name: journey.switchTo, exact: true }).click();
      }
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.title);
      await lookUp(page, person, copy);
    });

    await test.step('the slides', async () => {
      // One segment per slide; without featured projects that slide is skipped.
      await expect(page.locator('.segments li')).toHaveCount(journey.projects.length ? 2 : 1);
      // The animated count lands exactly on the total (screen readers get it right away).
      await expect(page.locator('.total-value [aria-hidden="true"]')).toHaveText(journey.total);
      await expect(page.locator('.metric')).toHaveCount(journey.metrics);

      if (journey.projects.length) {
        await page.getByRole('button', { name: copy.next }).click();
        // Featured: no forks without commits of their own; "Demo" only with a homepage.
        await expect(page.locator('.project-name')).toHaveText(journey.projects);
        await expect(page.getByRole('link', { name: /^Demo/ })).toHaveAttribute(
          'aria-label',
          `Demo de ${journey.projects[0] ?? ''}`,
        );
      }
      await toTheCards(page, copy);
    });

    const { path, year } = await test.step('choose a card and publish with GitHub', async () => {
      await page.getByRole('button', { name: journey.style }).click();
      await expect(page.locator('.cc-label')).toHaveText(journey.style);
      return publish(page, person, copy);
    });

    await test.step('the share screen', async () => {
      const url = `${WEB}${path}`;
      const card = page.getByRole('img', { name: copy.card(journey.style) });
      await expect(card).toBeVisible();

      // The card is 4:5 and its QR, read off the screen, opens the public page.
      const box = await card.boundingBox();
      expect(box && box.width / box.height).toBeCloseTo(4 / 5, 2);
      expect(readQr(await card.screenshot())).toBe(url);

      await page.getByRole('button', { name: copy.copy }).click();
      await expect(page.getByTestId('copy-status')).toContainText(copy.copied);
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);

      // Nothing renders the PNGs here: sharing waits for them instead of linking to nothing.
      for (const action of [copy.image, 'LinkedIn', 'X']) {
        await expect(page.getByRole('button', { name: copy.preparing(action) })).toBeDisabled();
      }
    });

    await test.step('the public page, in the wrap’s language', async () => {
      const response = await page.goto(path);

      expect(response?.status()).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      await expect(page.getByRole('link', { name: copy.seeYear })).toBeVisible();
    });

    await test.step('delete the wrap', async () => {
      await page.goto(`${path}/share`);
      await page.getByRole('button', { name: copy.remove }).click();
      const dialog = page.getByRole('dialog', { name: copy.confirm(year) });
      await dialog.getByRole('button', { name: copy.removeNow }).click();

      await expect(page).toHaveURL(`${WEB}/`);
      await expect(page.getByTestId('notice')).toHaveText(copy.removed(year));
    });

    await test.step('the link and the QR answer 410', async () => {
      const response = await page.goto(path);

      expect(response?.status()).toBe(410);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.gone);
    });
  });
}

test('a metric GitHub failed to answer is left out, all the way to the public page', async ({
  page,
}) => {
  const copy = COPY.es;
  await page.goto('/');
  await lookUp(page, PR_FALLA, copy);

  // Commits, reviews and issues; merged PRs neither as a card nor as a 0.
  await expect(page.locator('.metric')).toHaveCount(3);
  await expect(page.locator('.metrics')).not.toContainText(copy.mergedPRs);

  await toTheCards(page, copy);
  const { path } = await publish(page, PR_FALLA, copy);

  // Publishing asked GitHub again; it still failed, so the wrap went out without it.
  await page.goto(path);
  await page.getByRole('link', { name: copy.seeYear }).click();
  await expect(page).toHaveURL(`${WEB}${path}/slides`);
  await expect(page.locator('.metric')).toHaveCount(3);
  await expect(page.locator('.metrics')).not.toContainText(copy.mergedPRs);
});

test('publishing with someone else’s GitHub account is blocked, and nothing goes out', async ({
  page,
}) => {
  const copy = COPY.es;
  await page.goto('/');
  await lookUp(page, NICO, copy);
  await toTheCards(page, copy);
  const year = await announcedYear(page, NICO);

  await signInOnGitHubAs(page, ANA);
  await page.getByRole('button', { name: copy.publish }).click();

  await expect(page).toHaveURL(/\/\?oauth_error=WRONG_ACCOUNT/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    `Esta cuenta no es @${NICO.login}`,
  );
  await expect(page.getByText('así que no se publicó nada')).toBeVisible();
  expect((await page.request.get(`/@${NICO.login}/${year}`)).status()).toBe(404);
});
