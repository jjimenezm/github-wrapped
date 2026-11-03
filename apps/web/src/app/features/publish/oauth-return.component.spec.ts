import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationInitStatus, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { demoSnapshot } from '../../../testing/snapshot';
import { ExternalNavigation } from '../../core/browser/external-navigation';
import { provideI18n } from '../../core/i18n/i18n.providers';
import { PreviewStore } from '../../core/preview/preview.store';
import { OAuthReturnComponent } from './oauth-return.component';

@Component({ template: '' })
class StubComponent {}

describe('OAuthReturnComponent', () => {
  let harness: RouterTestingHarness;
  let go: ReturnType<typeof vi.fn<(url: string) => void>>;

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  async function arrive(query: string, { stored = true } = {}) {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-CL']);
    go = vi.fn<(url: string) => void>();
    TestBed.configureTestingModule({
      providers: [
        provideI18n(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: '', pathMatch: 'full', component: OAuthReturnComponent },
          { path: 'publish', component: StubComponent },
        ]),
        { provide: ExternalNavigation, useValue: { go } },
      ],
    });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    if (stored) {
      const store = TestBed.inject(PreviewStore);
      store.set(demoSnapshot());
      store.setStyle('cordillera');
    }
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/?${query}`);
  }

  const el = () => harness.routeNativeElement as HTMLElement;
  const text = (node: Element | null | undefined) =>
    node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const control = (name: string) =>
    [...(el()?.querySelectorAll('a, button') ?? [])].find((c) => text(c) === name) as
      HTMLElement | undefined;

  it('explains a different account, how to switch on github.com, and offers to sign out', async () => {
    await arrive('oauth_error=WRONG_ACCOUNT&login=ana-dev');

    expect(text(el().querySelector('h1'))).toBe('Esta cuenta no es @ana-dev');
    expect(text(el())).toContain('github.com');
    expect(control('Cerrar sesión')).toBeDefined();
    expect(control('Abrir github.com')?.getAttribute('href')).toBe('https://github.com/');
    expect(go).not.toHaveBeenCalled();
  });

  it('signs out of the app when asked', async () => {
    await arrive('oauth_error=WRONG_ACCOUNT&login=ana-dev');

    control('Cerrar sesión')?.click();
    const request = TestBed.inject(HttpTestingController).expectOne('/api/auth/logout');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await harness.fixture.whenStable();

    expect(text(el())).toContain('Cerraste la sesión');
  });

  it('says when the person can publish again and links to the page already published', async () => {
    const retryAt = '2026-11-04T15:30:00.000Z';
    await arrive(`oauth_error=REGENERATE_TOO_SOON&login=ana-dev&retry_at=${retryAt}`);
    // In the visitor's own time zone, with a 24-hour clock in Spanish.
    const when = new Intl.DateTimeFormat('es-CL', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .format(new Date(retryAt))
      .replace(/\s+/g, ' ');

    expect(text(el())).toContain(when);
    expect(when).toMatch(/de noviembre, \d\d:30$/);
    expect(control('Ver tu página publicada')?.getAttribute('href')).toBe('/@ana-dev/2026');
  });

  it('offers to retry an error from GitHub or the api, with the same card', async () => {
    await arrive('oauth_error=GITHUB_UNAVAILABLE&login=ana-dev');

    control('Reintentar')?.click();

    const url = new URL(go.mock.calls[0]?.[0] ?? '', 'http://x');
    expect(url.pathname).toBe('/api/auth/github');
    expect(url.searchParams.get('style')).toBe('cordillera');
    expect(url.searchParams.get('intent')).toBe('publish');
  });

  it('treats an unknown code like any other failure, never as a dead end', async () => {
    await arrive('oauth_error=SOMETHING_NEW&login=ana-dev');

    expect(control('Reintentar')).toBeDefined();
    expect(control('Volver al inicio')).toBeDefined();
  });

  it('sends the person back to the start when there is nothing to retry from', async () => {
    await arrive('oauth_error=OAUTH_FAILED&login=ana-dev', { stored: false });

    expect(control('Reintentar')).toBeUndefined();
    expect(control('Volver al inicio')?.getAttribute('href')).toBe('/');
  });

  it('goes quietly back to the cards when the person cancelled on GitHub', async () => {
    await arrive('oauth_error=OAUTH_CANCELLED&login=ana-dev');
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/publish');
  });

  it('asks to wait out a rate limit', async () => {
    await arrive('oauth_error=RATE_LIMITED&login=ana-dev&retry_after=90');

    expect(text(el())).toContain('2 minutos');
  });

  it('explains a year that can no longer change', async () => {
    await arrive('oauth_error=YEAR_FROZEN&login=ana-dev');

    expect(text(el().querySelector('h1'))).toBe('El wrap de 2026 ya está cerrado');
    expect(control('Ver tu página publicada')?.getAttribute('href')).toBe('/@ana-dev/2026');
  });

  it('reads in English too', async () => {
    localStorage.setItem('gw.locale', 'en');
    await arrive('oauth_error=WRONG_ACCOUNT&login=ana-dev');

    expect(text(el().querySelector('h1'))).toBe('This account is not @ana-dev');
  });
});
