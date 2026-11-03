import { ApplicationInitStatus, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideI18n } from './i18n.providers';
import { LOCALE_STORAGE_KEY } from './locale.service';
import { LocaleSwitchComponent } from './locale-switch.component';

@Component({
  imports: [LocaleSwitchComponent, TranslocoPipe],
  template: `<p data-testid="text">{{ 'loader.label' | transloco }}</p>
    <gw-locale-switch />`,
})
class HostComponent {}

async function render(): Promise<ComponentFixture<HostComponent>> {
  TestBed.configureTestingModule({ imports: [HostComponent], providers: [provideI18n()] });
  await TestBed.inject(ApplicationInitStatus).donePromise;
  const fixture = TestBed.createComponent(HostComponent);
  await fixture.whenStable();
  return fixture;
}

function text(fixture: ComponentFixture<HostComponent>): string {
  const el = fixture.nativeElement as HTMLElement;
  return el.querySelector('[data-testid="text"]')?.textContent?.trim() ?? '';
}

function button(fixture: ComponentFixture<HostComponent>, label: 'ES' | 'EN'): HTMLButtonElement {
  const el = fixture.nativeElement as HTMLElement;
  const found = [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
  if (!found) throw new Error(`No ${label} button`);
  return found;
}

function browserLanguages(...languages: string[]): void {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);
}

describe('LocaleSwitchComponent with the app i18n setup', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('shows Spanish for an es-CL browser', async () => {
    browserLanguages('es-CL', 'en');
    const fixture = await render();

    expect(text(fixture)).toBe('Cargando…');
    expect(document.documentElement.lang).toBe('es');
    expect(button(fixture, 'ES').getAttribute('aria-pressed')).toBe('true');
    expect(button(fixture, 'EN').getAttribute('aria-pressed')).toBe('false');
  });

  it('shows English for a de-DE browser', async () => {
    browserLanguages('de-DE', 'es-CL');
    const fixture = await render();

    expect(text(fixture)).toBe('Loading…');
    expect(document.documentElement.lang).toBe('en');
  });

  it('switches language in place and remembers the choice', async () => {
    browserLanguages('es-CL');
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;

    button(fixture, 'EN').click();

    await expect.poll(() => text(fixture)).toBe('Loading…');
    expect(fixture.nativeElement).toBe(host);
    expect(document.documentElement.lang).toBe('en');
    expect(button(fixture, 'EN').getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
  });

  it('keeps the last choice when the user switches before a dictionary finishes loading', async () => {
    browserLanguages('es-CL');
    const fixture = await render();

    button(fixture, 'EN').click();
    button(fixture, 'ES').click();

    await new Promise((resolve) => setTimeout(resolve, 50));
    await fixture.whenStable();
    expect(text(fixture)).toBe('Cargando…');
    expect(document.documentElement.lang).toBe('es');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('es');
  });

  it('prefers the stored choice over the browser language', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    browserLanguages('es-CL');
    const fixture = await render();

    expect(text(fixture)).toBe('Loading…');
  });

  it('ignores a stored value that is not a supported locale', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'fr');
    browserLanguages('es-CL');
    const fixture = await render();

    expect(text(fixture)).toBe('Cargando…');
  });

  it('falls back to the browser language and still switches when storage is blocked', async () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Storage is disabled', 'SecurityError');
    });
    browserLanguages('es-CL');
    const fixture = await render();

    expect(text(fixture)).toBe('Cargando…');

    button(fixture, 'EN').click();
    await expect.poll(() => text(fixture)).toBe('Loading…');
  });
});
