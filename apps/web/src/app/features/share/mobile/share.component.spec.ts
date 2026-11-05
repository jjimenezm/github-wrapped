import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationInitStatus, type Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { PublicWrap, WrapStatusView } from '@wrapped/shared';
import { installMatchMedia, type FakeMatchMedia } from '../../../../testing/match-media';
import { demoSnapshot } from '../../../../testing/snapshot';
import { ExternalNavigation } from '../../../core/browser/external-navigation';
import { PUBLIC_BASE_URL } from '../../../core/config/public-base-url';
import { provideI18n } from '../../../core/i18n/i18n.providers';
import { wrapMatcher } from '../../../core/routing/wrap-url';
import { EntryComponent } from '../../entry/mobile/entry.component';
import { ChangeCardComponent } from '../../publish/mobile/change-card.component';
import { STATUS_POLL_MAX_MS, STATUS_POLL_MS, ShareComponent, pollDelay } from './share.component';

const PUBLIC_URL = 'https://wrapped.jjimenezm.dev/@ana-dev/2026';
const V1 = { card: '/api/files/w/img/1/card.png', og: '/api/files/w/img/1/og.png' };
const MP4 = '/api/files/w/video/1.mp4';

const WRAP: PublicWrap = {
  login: 'ana-dev',
  year: 2026,
  locale: 'es',
  cardStyle: 'huella',
  snapshot: demoSnapshot(),
  publishedAt: '2026-11-03T20:00:00.000Z',
  imagesReadyVersion: null,
  images: null,
  videoReadyVersion: null,
  videoStatus: 'none',
  video: null,
};

const status = (overrides: Partial<WrapStatusView> = {}): WrapStatusView => ({
  imagesStatus: 'queued',
  imagesVersion: 1,
  imagesReadyVersion: null,
  videoStatus: 'none',
  videoReadyVersion: null,
  queuePosition: 1,
  images: null,
  videoQueuePosition: null,
  video: null,
  ...overrides,
});

const READY = status({
  imagesStatus: 'ready',
  imagesReadyVersion: 1,
  queuePosition: null,
  images: V1,
});

const apiError = (status: number, code: string) =>
  [
    { statusCode: status, code, message: code },
    { status, statusText: code },
  ] as const;

describe('ShareComponent', () => {
  let media: FakeMatchMedia;
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let go: ReturnType<typeof vi.fn<(url: string) => void>>;

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
    vi.restoreAllMocks();
    media.restore();
    localStorage.clear();
    Reflect.deleteProperty(navigator, 'clipboard');
    Reflect.deleteProperty(document, 'execCommand');
  });

  async function open(
    options: {
      wrap?: PublicWrap;
      status?: WrapStatusView | readonly [object, object];
      providers?: Provider[];
    } = {},
  ) {
    media = installMatchMedia({ '(prefers-reduced-motion: reduce)': true });
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-CL']);
    go = vi.fn<(url: string) => void>();
    TestBed.configureTestingModule({
      providers: [
        provideI18n(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: '', component: EntryComponent },
          { matcher: wrapMatcher('share'), component: ShareComponent },
          { matcher: wrapMatcher('card'), component: ChangeCardComponent },
        ]),
        { provide: ExternalNavigation, useValue: { go } },
        { provide: PUBLIC_BASE_URL, useValue: 'https://wrapped.jjimenezm.dev' },
        ...(options.providers ?? []),
      ],
    });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
    // Fake timers drive the status polling; the screen is settled by advancing them.
    vi.useFakeTimers();
    void TestBed.inject(Router).navigateByUrl('/@ana-dev/2026/share');
    await settle();
    http.expectOne('/api/wraps/ana-dev/2026').flush(options.wrap ?? WRAP);
    answerStatus(options.status ?? READY);
    await settle();
  }

  function answerStatus(answer: WrapStatusView | readonly [object, object]): void {
    const request = http.expectOne('/api/wraps/ana-dev/2026/status');
    if ('imagesStatus' in answer) request.flush(answer);
    else request.flush(answer[0], answer[1]);
  }

  async function settle(ms = 0): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
    harness.fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    harness.fixture.detectChanges();
  }

  const el = () => harness.fixture.nativeElement as HTMLElement;
  const text = (node: Element | null | undefined) =>
    node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const button = (name: string) =>
    [...el().querySelectorAll('button')].find(
      (b) => text(b) === name || b.getAttribute('aria-label') === name,
    );
  const link = (name: string) => [...el().querySelectorAll('a')].find((a) => text(a) === name);
  const action = (name: string) =>
    [...el().querySelectorAll<HTMLElement>('.action')].find(
      (a) => text(a.querySelector('.action-name')) === name,
    );
  const isWaiting = (node: HTMLElement | undefined) =>
    node?.tagName === 'BUTTON' &&
    (node as HTMLButtonElement).disabled &&
    node.querySelector('gw-grid-loader') !== null;

  describe('the link', () => {
    it('shows the public URL and copies it exactly with the Clipboard API', async () => {
      const writeText = vi.fn<(value: string) => Promise<void>>().mockResolvedValue();
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      await open();

      expect(text(el().querySelector('.url-text'))).toBe('wrapped.jjimenezm.dev/@ana-dev/2026');
      button('Copiar enlace')?.click();
      await settle();

      expect(writeText).toHaveBeenCalledWith(PUBLIC_URL);
      expect(text(el().querySelector('[data-testid="copy-status"]'))).toBe('Enlace copiado');
    });

    it('copies through a hidden field when the Clipboard API fails', async () => {
      const writeText = vi.fn<(value: string) => Promise<void>>().mockRejectedValue(new Error());
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      let copied = '';
      const execCommand = vi.fn<(command: string) => boolean>(() => {
        copied = (document.activeElement as HTMLTextAreaElement).value;
        return true;
      });
      Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
      await open();

      button('Copiar enlace')?.click();
      await settle();

      expect(execCommand).toHaveBeenCalledWith('copy');
      expect(copied).toBe(PUBLIC_URL);
      expect(text(el().querySelector('[data-testid="copy-status"]'))).toBe('Enlace copiado');
    });

    it('asks to copy it by hand when the browser copies nothing', async () => {
      Object.defineProperty(document, 'execCommand', { value: () => false, configurable: true });
      await open();

      button('Copiar enlace')?.click();
      await settle();

      expect(text(el().querySelector('[data-testid="copy-status"]'))).toBe(
        'No pudimos copiarlo. Mantén presionado el enlace para copiarlo.',
      );
    });
  });

  describe('sharing actions', () => {
    it('keeps Imagen, LinkedIn and X waiting while the images render, then turns them on', async () => {
      await open({ status: status() });

      for (const name of ['Imagen', 'LinkedIn', 'X']) {
        expect(isWaiting(action(name))).toBe(true);
      }
      expect(el().querySelector('.actions a')).toBeNull();

      await settle(STATUS_POLL_MS);
      answerStatus(READY);
      await settle();

      const image = action('Imagen');
      expect(image?.tagName).toBe('A');
      expect(image?.getAttribute('href')).toBe(V1.card);
      expect(image?.getAttribute('download')).toBe('github-wrapped-ana-dev-2026.png');
      expect(action('LinkedIn')?.getAttribute('href')).toContain('linkedin.com');
      expect(action('X')?.getAttribute('href')).toContain('x.com');
    });

    it('opens X with the text and the URL encoded, and LinkedIn with the URL', async () => {
      await open();

      const x = action('X');
      expect(x?.getAttribute('href')).toBe(
        'https://x.com/intent/post?text=' +
          encodeURIComponent('Mi 2026 en GitHub, hasta noviembre: 1.284 contribuciones.') +
          '&url=' +
          encodeURIComponent(PUBLIC_URL),
      );
      expect(x?.getAttribute('target')).toBe('_blank');
      expect(x?.getAttribute('rel')).toContain('noopener');
      expect(action('LinkedIn')?.getAttribute('href')).toBe(
        'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(PUBLIC_URL),
      );
    });

    it('writes the shared text and the card in the wrap’s language, not the screen’s', async () => {
      await open({ wrap: { ...WRAP, locale: 'en' } });

      expect(decodeURIComponent(action('X')?.getAttribute('href') ?? '')).toContain(
        'My 2026 on GitHub through November: 1,284 contributions.',
      );
      expect(text(el().querySelector('.card-art'))).toContain('contributions');
      expect(text(el().querySelector('h1'))).toBe('Listo para compartir');
    });

    it('offers "Reintentar" on a neutral Imagen when the images failed, then waits again', async () => {
      await open({ status: status({ imagesStatus: 'failed', queuePosition: null }) });

      const retry = action('Reintentar');
      expect(retry?.tagName).toBe('BUTTON');
      expect((retry as HTMLButtonElement).disabled).toBe(false);
      expect(retry?.querySelector('gw-grid-loader')).toBeNull();
      expect((action('LinkedIn') as HTMLButtonElement).disabled).toBe(true);
      expect(action('LinkedIn')?.querySelector('gw-grid-loader')).toBeNull();

      retry?.click();
      const request = http.expectOne('/api/wraps/ana-dev/2026/images/retry');
      expect(request.request.method).toBe('POST');
      request.flush(status());
      await settle();

      expect(isWaiting(action('Imagen'))).toBe(true);
      await settle(STATUS_POLL_MS);
      answerStatus(READY);
      await settle();
      expect(action('Imagen')?.getAttribute('href')).toBe(V1.card);
    });

    it('opens the QR full screen and closes it', async () => {
      await open();

      action('QR')?.click();
      await settle();

      const dialog = el().querySelector('[role="dialog"]');
      expect(dialog?.getAttribute('aria-label')).toBe('QR de tu wrap');
      expect(text(dialog)).toContain('wrapped.jjimenezm.dev/@ana-dev/2026');
      expect(dialog?.querySelector('.qr svg path')?.getAttribute('d')).toMatch(/^M\d/);

      button('Cerrar')?.click();
      await settle();
      expect(el().querySelector('[role="dialog"]')).toBeNull();
    });
  });

  describe('the video', () => {
    // Its parts sit side by side in a flex row; read them as a sentence.
    const line = () =>
      [...(el().querySelector('[data-testid="video-line"]')?.children ?? [])]
        .map((part) => text(part))
        .join(' ');
    const video = (overrides: Partial<WrapStatusView>) =>
      status({ ...READY, videoStatus: 'queued', videoQueuePosition: 2, ...overrides });

    it('hides the Video action and its line when the wrap has no video', async () => {
      await open();

      expect(action('Video')).toBeUndefined();
      expect(el().querySelector('[data-testid="video-line"]')).toBeNull();
      expect(action('QR')).toBeDefined();
    });

    it('goes from the mini loader, in line and rendering, to the green dot and the MP4', async () => {
      await open({ status: video({}) });

      expect(isWaiting(action('Video'))).toBe(true);
      expect(line()).toBe('En cola · posición 2');

      await settle(pollDelay(1));
      answerStatus(video({ videoStatus: 'rendering', videoQueuePosition: null }));
      await settle();
      expect(isWaiting(action('Video'))).toBe(true);
      expect(line()).toBe('Preparando tu video de 30 s · sigue aunque cierres esta pantalla');

      await settle(pollDelay(2));
      answerStatus(video({ videoStatus: 'ready', videoReadyVersion: 1, video: MP4 }));
      await settle();
      const ready = action('Video');
      expect(ready?.tagName).toBe('A');
      expect(ready?.getAttribute('href')).toBe(MP4);
      expect(ready?.getAttribute('download')).toBe('github-wrapped-ana-dev-2026.mp4');
      expect(ready?.getAttribute('target')).toBe('_blank');
      expect(ready?.getAttribute('rel')).toBe('noopener');
      expect(ready?.querySelector('.ready-dot')).not.toBeNull();
      expect(line()).toBe('');

      // Everything is ready: no more questions.
      await settle(STATUS_POLL_MAX_MS * 2);
      http.expectNone('/api/wraps/ana-dev/2026/status');
    });

    it('says a failed video in a neutral line; "Reintentar" puts it back in line', async () => {
      await open({ status: video({ videoStatus: 'failed', videoQueuePosition: null }) });

      expect(line()).toBe('No pudimos generar el video · Reintentar');
      expect(el().querySelector('[data-testid="video-line"] .error')).toBeNull();
      const icon = action('Video') as HTMLButtonElement;
      expect(icon.disabled).toBe(true);
      expect(icon.querySelector('gw-grid-loader')).toBeNull();

      button('Reintentar')?.click();
      const request = http.expectOne('/api/wraps/ana-dev/2026/video/retry');
      expect(request.request.method).toBe('POST');
      request.flush(video({ videoQueuePosition: 1 }));
      await settle();

      expect(line()).toBe('En cola · posición 1');
      expect(isWaiting(action('Video'))).toBe(true);
      await settle(STATUS_POLL_MS);
      answerStatus(video({ videoStatus: 'rendering', videoQueuePosition: null }));
      await settle();
      expect(line()).toContain('Preparando tu video');
    });

    it('says only "En cola" while the render waits for its automatic retry', async () => {
      await open({ status: video({ videoQueuePosition: null }) });

      expect(line()).toBe('En cola');
      await settle(pollDelay(1));
      answerStatus(READY);
      await settle();
    });

    it('asks less and less often while it waits, up to every 15 s', () => {
      expect([1, 2, 3, 4, 5, 6, 7].map(pollDelay)).toEqual([
        2_000, 3_000, 4_500, 6_750, 10_125, 15_000, 15_000,
      ]);
    });

    it('lists the video in the deletion sheet when there is one', async () => {
      await open({ status: video({}) });

      button('Eliminar mi wrap')?.click();
      await settle();
      expect(text(el().querySelector('[role="dialog"]'))).toContain('El video de 30 s');
      button('Cancelar')?.click();
      await settle(pollDelay(1));
      answerStatus(READY);
      await settle();
    });
  });

  it('keeps asking through a network hiccup', async () => {
    await open({ status: apiError(503, 'UNKNOWN') });

    expect(el().querySelector('gw-grid-loader[role="status"]')).not.toBeNull();
    await settle(STATUS_POLL_MS * 2);
    answerStatus(READY);
    await settle();

    expect(action('Imagen')?.getAttribute('href')).toBe(V1.card);
  });

  describe('changing the card', () => {
    it('opens the carousel in change mode; back on this screen the new card waits for its images', async () => {
      await open();
      expect(text(el().querySelector('.card-caption'))).toContain('Huella');

      link('Cambiar tarjeta')?.click();
      await settle();
      expect(TestBed.inject(Router).url).toBe('/@ana-dev/2026/card');
      http.expectOne('/api/wraps/ana-dev/2026').flush({ ...WRAP, images: V1 });
      http.expectOne('/api/auth/session').flush({ githubUserId: 583231, login: 'ana-dev' });
      await settle();
      (el().querySelector('.cc-dots button[aria-label="Cordillera"]') as HTMLElement).click();
      await settle();
      button('Guardar tarjeta')?.click();
      http.expectOne('/api/wraps/ana-dev/2026/card').flush({ ...WRAP, cardStyle: 'cordillera' });
      await settle();

      expect(TestBed.inject(Router).url).toBe('/@ana-dev/2026/share');
      http.expectOne('/api/wraps/ana-dev/2026').flush({ ...WRAP, cardStyle: 'cordillera' });
      answerStatus(status({ imagesVersion: 2, imagesReadyVersion: 1, images: V1 }));
      await settle();

      expect(text(el().querySelector('.card-caption'))).toContain('Cordillera');
      for (const name of ['Imagen', 'LinkedIn', 'X']) {
        expect(isWaiting(action(name))).toBe(true);
      }
    });
  });

  describe('deleting', () => {
    it('asks first, then deletes and goes back to the entry with a notice', async () => {
      await open();

      button('Eliminar mi wrap')?.click();
      await settle();
      expect(text(el().querySelector('[role="dialog"]'))).toContain('¿Eliminar tu wrap 2026?');
      http.expectNone('/api/wraps/ana-dev/2026');

      button('Eliminar wrap')?.click();
      const request = http.expectOne('/api/wraps/ana-dev/2026');
      expect(request.request.method).toBe('DELETE');
      request.flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      expect(TestBed.inject(Router).url).toBe('/');
      expect(text(el().querySelector('[data-testid="notice"]'))).toBe(
        'Eliminamos tu wrap 2026. El link y el QR ya no funcionan.',
      );
    });

    it('keeps everything when the person cancels', async () => {
      await open();

      button('Eliminar mi wrap')?.click();
      await settle();
      button('Cancelar')?.click();
      await settle();

      expect(el().querySelector('[role="dialog"]')).toBeNull();
      expect(document.activeElement).toBe(button('Eliminar mi wrap'));
      http.expectNone('/api/wraps/ana-dev/2026');
    });

    it('goes through GitHub when the session expired before deleting', async () => {
      await open();

      button('Eliminar mi wrap')?.click();
      await settle();
      button('Eliminar wrap')?.click();
      http.expectOne('/api/wraps/ana-dev/2026').flush(...apiError(401, 'UNAUTHENTICATED'));
      await settle();

      expect(new URL(go.mock.calls[0]?.[0] ?? '', 'http://x').searchParams.get('intent')).toBe(
        'manage',
      );
    });
  });

  describe('who can see it', () => {
    it('asks to confirm with GitHub when the session does not own the wrap', async () => {
      await open({ status: apiError(401, 'UNAUTHENTICATED') });

      expect(text(el().querySelector('h1'))).toBe('Confirma que el wrap es tuyo');
      expect(button('Copiar enlace')).toBeUndefined();
      button('Continuar con GitHub')?.click();

      const url = new URL(go.mock.calls[0]?.[0] ?? '', 'http://x');
      expect(url.pathname).toBe('/api/auth/github');
      expect(Object.fromEntries(url.searchParams)).toEqual({
        login: 'ana-dev',
        intent: 'manage',
        year: '2026',
      });
    });

    it('says the wrap is gone when it was deleted', async () => {
      media = installMatchMedia();
      vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-CL']);
      TestBed.configureTestingModule({
        providers: [
          provideI18n(),
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter([{ matcher: wrapMatcher('share'), component: ShareComponent }]),
        ],
      });
      await TestBed.inject(ApplicationInitStatus).donePromise;
      http = TestBed.inject(HttpTestingController);
      harness = await RouterTestingHarness.create();
      vi.useFakeTimers();
      void TestBed.inject(Router).navigateByUrl('/@ana-dev/2026/share');
      await settle();
      http.expectOne('/api/wraps/ana-dev/2026').flush(...apiError(410, 'WRAP_DELETED'));
      answerStatus(apiError(410, 'WRAP_DELETED'));
      await settle();

      expect(text(el().querySelector('h1'))).toBe('Este wrap ya no está disponible');
      expect(link('Volver al inicio')?.getAttribute('href')).toBe('/');
    });
  });
});
