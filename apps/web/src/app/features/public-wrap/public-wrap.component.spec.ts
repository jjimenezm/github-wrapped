import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationInitStatus, Component, DOCUMENT, RESPONSE_INIT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { PublicWrap } from '@wrapped/shared';
import { installMatchMedia, type FakeMatchMedia } from '../../../testing/match-media';
import { demoSnapshot } from '../../../testing/snapshot';
import { PUBLIC_BASE_URL } from '../../core/config/public-base-url';
import { provideI18n } from '../../core/i18n/i18n.providers';
import { wrapPageMatch } from '../../core/routing/wrap-url';
import { PUBLIC_WRAP_ROUTES } from './public-wrap.routes';

@Component({ template: '<p data-testid="entry">entry</p>' })
class EntryStubComponent {}

const WRAP: PublicWrap = {
  login: 'ana-dev',
  year: 2026,
  locale: 'es',
  cardStyle: 'cordillera',
  snapshot: demoSnapshot(),
  publishedAt: '2026-11-03T20:00:00.000Z',
  imagesReadyVersion: 2,
  images: { card: '/api/files/w/img/2/card.png', og: '/api/files/w/img/2/og.png' },
  videoReadyVersion: null,
  videoStatus: 'none',
};

const apiError = (status: number, code: string) =>
  [
    { statusCode: status, code, message: code },
    { status, statusText: code },
  ] as const;

describe('Public wrap page', () => {
  let media: FakeMatchMedia;
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let response: ResponseInit;

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
    media.restore();
    localStorage.clear();
  });

  async function configure(languages: string[]) {
    media = installMatchMedia({ '(prefers-reduced-motion: reduce)': true });
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);
    response = {};
    TestBed.configureTestingModule({
      providers: [
        provideI18n(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: '', component: EntryStubComponent },
          { path: ':handle/:year', canMatch: [wrapPageMatch], children: PUBLIC_WRAP_ROUTES },
        ]),
        { provide: PUBLIC_BASE_URL, useValue: 'https://wrapped.jjimenezm.dev' },
        { provide: RESPONSE_INIT, useValue: response },
      ],
    });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  }

  /** The router asks the api a few microtasks into the navigation. */
  async function answer(path: string, body: PublicWrap | readonly [object, object]) {
    const request = await vi.waitFor(() => http.expectOne(path));
    if ('login' in body) request.flush(body);
    else request.flush(body[0], body[1]);
  }

  /** Straight through the router: the api answers before anything waits for stability. */
  async function open(
    url: string,
    body: PublicWrap | readonly [object, object] = WRAP,
    languages = ['es-CL'],
  ) {
    await configure(languages);
    const navigation = TestBed.inject(Router).navigateByUrl(url);
    await answer(`/api/wraps/${url.split('/')[1]?.slice(1)}/2026`, body);
    await navigation;
    await settle();
  }

  async function settle(): Promise<void> {
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
  }

  const el = () => harness.fixture.nativeElement as HTMLElement;
  const text = (node: Element | null | undefined) =>
    node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const link = (name: string) => [...el().querySelectorAll('a')].find((a) => text(a) === name);
  const meta = (key: string) =>
    TestBed.inject(DOCUMENT)
      .head.querySelector(`meta[property="${key}"], meta[name="${key}"]`)
      ?.getAttribute('content');

  describe('a published wrap', () => {
    it('shows the card first, then "Ver mi año", with "Crea el tuyo" on top', async () => {
      await open('/@ana-dev/2026');

      // Only who it belongs to comes before the card; every action comes after it.
      const blocks = [...(el().querySelector('main')?.children ?? [])];
      const card = blocks.findIndex((block) => block.classList.contains('card'));
      expect(card).toBe(1);
      expect(blocks[0]?.querySelector('h1')?.textContent?.trim()).toBe('@ana-dev');
      expect(blocks.indexOf(link('Ver mi año') as Element)).toBeGreaterThan(card);
      expect(link('Ver mi año')?.getAttribute('href')).toBe('/@ana-dev/2026/slides');
      expect(link('Crea el tuyo')?.getAttribute('href')).toBe('/');
      expect(el().querySelector('.card svg')).not.toBeNull();
    });

    it('describes itself for link previews with absolute URLs', async () => {
      await open('/@ana-dev/2026');

      expect(meta('og:image')).toBe('https://wrapped.jjimenezm.dev/api/files/w/img/2/og.png');
      expect(meta('og:image:width')).toBe('1200');
      expect(meta('og:image:height')).toBe('630');
      expect(meta('og:url')).toBe('https://wrapped.jjimenezm.dev/@ana-dev/2026');
      expect(meta('og:title')).toContain('@ana-dev');
      expect(meta('og:description')).toBe(
        'Mi 2026 en GitHub, hasta noviembre: 1.284 contribuciones.',
      );
      expect(meta('twitter:card')).toBe('summary_large_image');
      expect(meta('twitter:image')).toBe(meta('og:image'));
      expect(TestBed.inject(DOCUMENT).title).toContain('@ana-dev');
    });

    it('leaves og:image out while the first images still render', async () => {
      await open('/@ana-dev/2026', { ...WRAP, imagesReadyVersion: null, images: null });

      expect(meta('og:image')).toBeUndefined();
      expect(meta('twitter:card')).toBe('summary_large_image');
    });

    it('speaks the wrap’s language, not the browser’s', async () => {
      await open('/@ana-dev/2026', { ...WRAP, locale: 'en' }, ['es-CL']);

      expect(TestBed.inject(DOCUMENT).documentElement.lang).toBe('en');
      expect(link('See my year')).toBeDefined();
      expect(text(el().querySelector('.card'))).toContain('contributions');
      expect(meta('og:locale')).toBe('en_US');
    });

    it('draws no video block while there is no video', async () => {
      await open('/@ana-dev/2026');

      expect(el().querySelector('video, .video')).toBeNull();
    });

    it('offers the owner "¿Es tuyo? Gestionar" through GitHub', async () => {
      await open('/@ana-dev/2026');

      const manage = link('¿Es tuyo? Gestionar');
      expect(manage?.getAttribute('href')).toBe(
        '/api/auth/github?login=ana-dev&intent=manage&year=2026',
      );
    });

    it('explains, back from GitHub, that another account is not the owner', async () => {
      await open('/@ana-dev/2026?oauth_error=WRONG_ACCOUNT');

      expect(text(el().querySelector('[role="status"]'))).toContain(
        'Esa cuenta de GitHub no es @ana-dev',
      );
    });

    it('says nothing when the owner cancelled on GitHub', async () => {
      await open('/@ana-dev/2026?oauth_error=OAUTH_CANCELLED');

      expect(el().querySelector('.notice')).toBeNull();
    });

    it('moves a renamed login to its new address for good', async () => {
      await configure(['es-CL']);
      const navigation = TestBed.inject(Router).navigateByUrl('/@ana-vieja/2026');
      // The api follows the rename (301) and answers with the current login.
      await answer('/api/wraps/ana-vieja/2026', { ...WRAP, login: 'ana-dev' });
      await answer('/api/wraps/ana-dev/2026', WRAP);
      await navigation;
      await settle();

      expect(TestBed.inject(Router).url).toBe('/@ana-dev/2026');
      expect(response.status).toBe(301);
    });
  });

  describe('the slides from the page', () => {
    it('opens the year as Stories and comes back to the card', async () => {
      await open('/@ana-dev/2026');

      link('Ver mi año')?.click();
      await settle();
      expect(TestBed.inject(Router).url).toBe('/@ana-dev/2026/slides');
      expect(el().querySelector('gw-stories')).not.toBeNull();

      [...el().querySelectorAll('button')].find((b) => text(b) === 'Volver a la tarjeta')?.click();
      await settle();
      expect(TestBed.inject(Router).url).toBe('/@ana-dev/2026');
    });

    it('gives the visitor’s language back when they leave for the entry', async () => {
      await open('/@ana-dev/2026', { ...WRAP, locale: 'en' }, ['es-CL']);

      link('Make yours')?.click();
      await settle();

      expect(el().querySelector('[data-testid="entry"]')).not.toBeNull();
      expect(TestBed.inject(DOCUMENT).documentElement.lang).toBe('es');
    });
  });

  describe('without a wrap', () => {
    it('answers 410 for a deleted wrap and invites to make one', async () => {
      await open('/@ana-dev/2026', apiError(410, 'WRAP_DELETED'));

      expect(response.status).toBe(410);
      expect(text(el().querySelector('h1'))).toBe('Este wrap ya no está disponible');
      expect(link('Crea el tuyo')?.getAttribute('href')).toBe('/');
      expect(meta('robots')).toBe('noindex');
    });

    it('answers 404 for a login that never published, with a link to create it', async () => {
      await open('/@mcuevas/2026', apiError(404, 'WRAP_NOT_FOUND'));

      expect(response.status).toBe(404);
      expect(text(el().querySelector('h1'))).toBe('@mcuevas todavía no tiene su wrap 2026');
      expect(link('Crear mi wrap')?.getAttribute('href')).toBe('/?login=mcuevas');
      expect(link('Volver al inicio')?.getAttribute('href')).toBe('/');
    });

    it('asks to try again when the api fails, without claiming the wrap is gone', async () => {
      await open('/@ana-dev/2026', apiError(503, 'UNKNOWN'));

      expect(response.status).toBe(503);
      expect(text(el().querySelector('h1'))).toBe('No pudimos cargar este wrap');
    });
  });
});
