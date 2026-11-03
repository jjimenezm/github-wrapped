import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationInitStatus, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { demoSnapshot } from '../../../../testing/snapshot';
import { provideI18n } from '../../../core/i18n/i18n.providers';
import { PreviewStore } from '../../../core/preview/preview.store';
import { EntryComponent } from './entry.component';
import { MESSAGE_INTERVAL_MS } from './loading.component';

@Component({ template: '' })
class RevealStubComponent {}

interface Harness {
  fixture: ComponentFixture<EntryComponent>;
  el: HTMLElement;
  http: HttpTestingController;
  router: Router;
}

describe('EntryComponent', () => {
  let h: Harness;

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
    h.http.verify();
  });

  async function render(languages: string[] = ['es-CL']): Promise<Harness> {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);
    TestBed.configureTestingModule({
      imports: [EntryComponent],
      providers: [
        provideI18n(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'slides', component: RevealStubComponent }]),
      ],
    });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(EntryComponent);
    fixture.detectChanges();
    h = {
      fixture,
      el: fixture.nativeElement as HTMLElement,
      http: TestBed.inject(HttpTestingController),
      router: TestBed.inject(Router),
    };
    return h;
  }

  const input = () => h.el.querySelector<HTMLInputElement>('input#gh-login');
  const loading = () => h.el.querySelector('gw-loading');
  const feedback = () => h.el.querySelector('[data-testid="feedback"]')?.textContent?.trim() ?? '';
  const buttonNamed = (name: string) =>
    [...h.el.querySelectorAll('button')].find((b) => b.textContent?.trim() === name);

  function type(value: string): void {
    const field = input();
    if (!field) throw new Error('No login field');
    field.value = value;
    field.dispatchEvent(new Event('input'));
    h.fixture.detectChanges();
  }

  function submit(value: string): void {
    type(value);
    buttonNamed('Crear mi wrap')?.click();
    h.fixture.detectChanges();
  }

  async function wait(ms: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
    h.fixture.detectChanges();
  }

  const apiError = (status: number, code: string, extra: Record<string, unknown> = {}) => ({
    body: { statusCode: status, code, message: code, ...extra },
    init: { status, statusText: code },
  });

  async function failLookup(status: number, code: string, extra?: Record<string, unknown>) {
    const { body, init } = apiError(status, code, extra);
    h.http.expectOne('/api/preview/ana').flush(body, init);
    await wait(MESSAGE_INTERVAL_MS);
  }

  describe('before calling the api', () => {
    it('asks for a username when the field is empty', async () => {
      await render();

      submit('   ');

      expect(feedback()).toBe('Escribe tu usuario de GitHub.');
      expect(input()?.getAttribute('aria-invalid')).toBe('true');
      expect(input()?.getAttribute('aria-describedby')).toContain('gh-login-feedback');
      expect(loading()).toBeNull();
      h.http.expectNone(() => true);
    });

    it('rejects something that cannot be a GitHub login', async () => {
      await render();

      submit('ana dev');

      expect(feedback()).toBe('Ese no parece un usuario de GitHub. Usa letras, números y guiones.');
      h.http.expectNone(() => true);
    });

    it('clears the message once the person types again', async () => {
      await render();
      submit('');

      type('a');

      expect(feedback()).toBe('');
      expect(input()?.getAttribute('aria-invalid')).toBe('false');
    });
  });

  describe('looking up', () => {
    it('drops the @ and looks up the login in lowercase', async () => {
      await render();

      submit('@Ana');

      expect(loading()?.textContent).toContain('@ana');
      expect(h.http.expectOne('/api/preview/ana').request.method).toBe('GET');
    });

    it('accepts a pasted profile URL', async () => {
      await render();

      submit('https://github.com/Ana-Dev');

      h.http.expectOne('/api/preview/ana-dev');
    });

    it('keeps the messages rotating, with no percentage, while GitHub takes 12 s', async () => {
      await render();
      submit('ana');
      const first = loading()?.textContent;

      await wait(12_000);

      expect(loading()).not.toBeNull();
      expect(loading()?.textContent).not.toBe(first);
      expect(h.el.textContent).not.toMatch(/\d\s*%/);
      expect(h.el.querySelector('progress, [role="progressbar"]')).toBeNull();
      h.http.expectOne('/api/preview/ana').flush(demoSnapshot({ login: 'ana' }));
    });

    it('goes back to the form when the person cancels', async () => {
      await render();
      submit('ana');
      const request = h.http.expectOne('/api/preview/ana');

      buttonNamed('Cancelar')?.click();
      await wait(0);

      expect(request.cancelled).toBe(true);
      expect(loading()).toBeNull();
      expect(input()?.value).toBe('ana');
      expect(document.activeElement).toBe(input());
    });
  });

  describe('when it works', () => {
    it('opens the reveal with the snapshot, after the first message has been read', async () => {
      await render();
      const snapshot = demoSnapshot({ login: 'ana' });
      submit('ana');

      h.http.expectOne('/api/preview/ana').flush(snapshot);
      await wait(MESSAGE_INTERVAL_MS - 1);
      expect(loading()).not.toBeNull();
      expect(h.router.url).toBe('/');

      await wait(1);
      expect(h.router.url).toBe('/slides');
      expect(TestBed.inject(PreviewStore).snapshot()).toEqual(snapshot);
    });
  });

  describe('when the api says no', () => {
    it('explains an unknown user under the field, in Spanish', async () => {
      await render();
      submit('ana');

      await failLookup(404, 'USER_NOT_FOUND');

      expect(loading()).toBeNull();
      expect(feedback()).toBe('No encontramos ese usuario. Revisa el nombre e inténtalo otra vez.');
      expect(input()?.value).toBe('ana');
      expect(document.activeElement).toBe(input());
    });

    it('explains an unknown user in English', async () => {
      await render(['de-DE']);
      type('ana');
      buttonNamed('Create my wrap')?.click();
      h.fixture.detectChanges();

      await failLookup(404, 'USER_NOT_FOUND');

      expect(feedback()).toBe("We couldn't find that user. Check the name and try again.");
    });

    it('asks to wait when GitHub is rate limited, then lets the person retry', async () => {
      await render();
      submit('ana');

      await failLookup(503, 'GITHUB_RATE_LIMITED', { retryAfter: 30 });

      expect(feedback()).toContain('30 segundos');
      expect(buttonNamed('Reintentar')?.disabled).toBe(true);

      await wait(30_000);
      expect(buttonNamed('Reintentar')?.disabled).toBe(false);

      buttonNamed('Reintentar')?.click();
      h.fixture.detectChanges();
      expect(loading()).not.toBeNull();
      h.http.expectOne('/api/preview/ana').flush(demoSnapshot({ login: 'ana' }));
    });

    it('rounds a long wait to minutes', async () => {
      await render();
      submit('ana');

      await failLookup(429, 'RATE_LIMITED', { retryAfter: 90 });

      expect(feedback()).toContain('2 minutos');
    });

    it('offers an immediate retry when GitHub is down', async () => {
      await render();
      submit('ana');

      await failLookup(502, 'GITHUB_UNAVAILABLE');

      expect(feedback()).toBe(
        'GitHub no responde en este momento. Inténtalo otra vez en unos segundos.',
      );
      expect(buttonNamed('Reintentar')?.disabled).toBe(false);
    });

    it('says so when the request never reached the api', async () => {
      await render();
      submit('ana');

      h.http.expectOne('/api/preview/ana').error(new ProgressEvent('error'));
      await wait(MESSAGE_INTERVAL_MS);

      expect(feedback()).toBe('No pudimos conectarnos. Revisa tu conexión e inténtalo otra vez.');
    });
  });
});
