import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationInitStatus, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { CardStyle, PublicWrap } from '@wrapped/shared';
import { installMatchMedia, type FakeMatchMedia } from '../../../../testing/match-media';
import { demoSnapshot } from '../../../../testing/snapshot';
import { ExternalNavigation } from '../../../core/browser/external-navigation';
import { provideI18n } from '../../../core/i18n/i18n.providers';
import { wrapMatcher } from '../../../core/routing/wrap-url';
import { ChangeCardComponent } from './change-card.component';

@Component({ template: '' })
class ShareStubComponent {}

const WRAP: PublicWrap = {
  login: 'ana-dev',
  year: 2026,
  locale: 'es',
  cardStyle: 'huella',
  snapshot: demoSnapshot(),
  publishedAt: '2026-11-03T20:00:00.000Z',
  imagesReadyVersion: 1,
  images: { card: '/api/files/w/img/1/card.png', og: '/api/files/w/img/1/og.png' },
  videoReadyVersion: null,
  videoStatus: 'none',
  video: null,
};

describe('ChangeCardComponent', () => {
  let media: FakeMatchMedia;
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let go: ReturnType<typeof vi.fn<(url: string) => void>>;

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
    media.restore();
    localStorage.clear();
  });

  async function open({ signedIn = true } = {}) {
    media = installMatchMedia({ '(prefers-reduced-motion: reduce)': true });
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-CL']);
    go = vi.fn<(url: string) => void>();
    TestBed.configureTestingModule({
      providers: [
        provideI18n(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { matcher: wrapMatcher('card'), component: ChangeCardComponent },
          { matcher: wrapMatcher('share'), component: ShareStubComponent },
        ]),
        { provide: ExternalNavigation, useValue: { go } },
      ],
    });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
    // Straight through the router: the harness would wait for stability, which the pending
    // requests below hold back until they are answered.
    await TestBed.inject(Router).navigateByUrl('/@ana-dev/2026/card');
    http.expectOne('/api/wraps/ana-dev/2026').flush(WRAP);
    const session = http.expectOne('/api/auth/session');
    if (signedIn) session.flush({ githubUserId: 583231, login: 'ana-dev' });
    else
      session.flush(
        { statusCode: 401, code: 'UNAUTHENTICATED', message: 'Sign in' },
        { status: 401, statusText: 'Unauthorized' },
      );
    await settle();
  }

  async function settle(): Promise<void> {
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
  }

  const el = () => harness.routeNativeElement as HTMLElement;
  const text = (node: Element | null | undefined) =>
    node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const button = (name: string) =>
    [...el().querySelectorAll('button')].find((b) => text(b) === name);

  async function pick(style: CardStyle): Promise<void> {
    const names: Record<CardStyle, string> = {
      huella: 'Huella',
      cordillera: 'Cordillera',
      constelacion: 'Constelación',
    };
    (el().querySelector(`.cc-dots button[aria-label="${names[style]}"]`) as HTMLElement).click();
    await settle();
  }

  it('opens on the card already published, without publishing copy', async () => {
    await open();

    expect(text(el().querySelector('.cc-label'))).toBe('Huella');
    expect(text(el())).not.toContain('Se publica en');
  });

  it('saves a new card with the current session and goes back to the share screen', async () => {
    await open();
    expect(button('Guardar tarjeta')?.disabled).toBe(true);
    await pick('cordillera');

    button('Guardar tarjeta')?.click();
    const request = http.expectOne('/api/wraps/ana-dev/2026/card');
    expect(request.request.body).toEqual({ cardStyle: 'cordillera' });
    request.flush({ ...WRAP, cardStyle: 'cordillera' });
    await settle();

    expect(TestBed.inject(Router).url).toBe('/@ana-dev/2026/share');
    expect(go).not.toHaveBeenCalled();
  });

  it('asks to continue with GitHub when the session expired, carrying the chosen card', async () => {
    await open({ signedIn: false });
    await pick('constelacion');

    button('Continuar con GitHub')?.click();

    const url = new URL(go.mock.calls[0]?.[0] ?? '', 'http://x');
    expect(url.pathname).toBe('/api/auth/github');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      login: 'ana-dev',
      intent: 'change-card',
      style: 'constelacion',
      year: '2026',
    });
  });

  it('falls back to GitHub when the session runs out while saving', async () => {
    await open();
    await pick('cordillera');

    button('Guardar tarjeta')?.click();
    http
      .expectOne('/api/wraps/ana-dev/2026/card')
      .flush(
        { statusCode: 401, code: 'UNAUTHENTICATED', message: 'Sign in' },
        { status: 401, statusText: 'Unauthorized' },
      );
    await settle();

    expect(new URL(go.mock.calls[0]?.[0] ?? '', 'http://x').searchParams.get('intent')).toBe(
      'change-card',
    );
  });

  it('explains when the signed-in account does not own the wrap', async () => {
    await open();
    await pick('cordillera');

    button('Guardar tarjeta')?.click();
    http
      .expectOne('/api/wraps/ana-dev/2026/card')
      .flush(
        { statusCode: 403, code: 'NOT_OWNER', message: 'Not yours' },
        { status: 403, statusText: 'Forbidden' },
      );
    await settle();

    expect(text(el().querySelector('[role="alert"]'))).toContain('Esta cuenta no es @ana-dev');
  });
});
