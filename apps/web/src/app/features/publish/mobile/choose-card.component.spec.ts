import { ApplicationInitStatus, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { installMatchMedia, type FakeMatchMedia } from '../../../../testing/match-media';
import { demoSnapshot } from '../../../../testing/snapshot';
import { ExternalNavigation } from '../../../core/browser/external-navigation';
import { provideI18n } from '../../../core/i18n/i18n.providers';
import { LocaleService } from '../../../core/i18n/locale.service';
import { PreviewStore } from '../../../core/preview/preview.store';
import { ChooseCardComponent } from './choose-card.component';

@Component({ template: '' })
class SlidesStubComponent {}

describe('ChooseCardComponent', () => {
  let media: FakeMatchMedia;
  let fixture: ComponentFixture<ChooseCardComponent>;
  let go: ReturnType<typeof vi.fn<(url: string) => void>>;

  afterEach(() => {
    vi.restoreAllMocks();
    media.restore();
    localStorage.clear();
    sessionStorage.clear();
  });

  async function render() {
    media = installMatchMedia({ '(prefers-reduced-motion: reduce)': true });
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-CL']);
    go = vi.fn<(url: string) => void>();
    TestBed.configureTestingModule({
      imports: [ChooseCardComponent],
      providers: [
        provideI18n(),
        provideRouter([{ path: 'slides', component: SlidesStubComponent }]),
        { provide: ExternalNavigation, useValue: { go } },
      ],
    });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    TestBed.inject(PreviewStore).set(demoSnapshot());
    fixture = TestBed.createComponent(ChooseCardComponent);
    await fixture.whenStable();
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const text = (node: Element | null | undefined) =>
    node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const button = (name: string) =>
    [...el().querySelectorAll('button, a')].find(
      (b) => text(b) === name || b.getAttribute('aria-label') === name,
    ) as HTMLElement | undefined;
  const params = () =>
    Object.fromEntries(new URL(go.mock.calls[0]?.[0] ?? '', 'http://x').searchParams);

  async function pick(name: string): Promise<void> {
    (el().querySelector(`.cc-dots button[aria-label="${name}"]`) as HTMLElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('says the wrap is ready and where it will be published', async () => {
    await render();

    expect(text(el().querySelector('h1'))).toBe('Tu wrap está listo');
    expect(text(el().querySelector('.fine'))).toBe(
      'Se publica en /@ana-dev/2026. Solo tú podrás cambiarlo o eliminarlo.',
    );
  });

  it('publishes the chosen card through GitHub, carrying style and language', async () => {
    await render();
    await pick('Cordillera');

    button('Continuar con GitHub para publicar')?.click();

    expect(go).toHaveBeenCalledOnce();
    expect(go.mock.calls[0]?.[0].startsWith('/api/auth/github?')).toBe(true);
    expect(params()).toEqual({
      login: 'ana-dev',
      intent: 'publish',
      style: 'cordillera',
      locale: 'es',
    });
  });

  it('publishes in English when the person switched to English, whatever the browser says', async () => {
    await render();
    await TestBed.inject(LocaleService).use('en');
    fixture.detectChanges();
    await fixture.whenStable();

    button('Continue with GitHub to publish')?.click();

    expect(params()['locale']).toBe('en');
  });

  it('remembers the card for the way back from GitHub', async () => {
    await render();
    await pick('Constelación');

    button('Continuar con GitHub para publicar')?.click();

    expect(TestBed.inject(PreviewStore).style()).toBe('constelacion');
  });

  it('opens on the card picked before, after a round trip', async () => {
    media = installMatchMedia({ '(prefers-reduced-motion: reduce)': true });
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-CL']);
    TestBed.configureTestingModule({
      imports: [ChooseCardComponent],
      providers: [
        provideI18n(),
        provideRouter([]),
        { provide: ExternalNavigation, useValue: { go: vi.fn() } },
      ],
    });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    const store = TestBed.inject(PreviewStore);
    store.set(demoSnapshot());
    store.setStyle('cordillera');
    fixture = TestBed.createComponent(ChooseCardComponent);
    await fixture.whenStable();

    expect(text(el().querySelector('.cc-label'))).toBe('Cordillera');
  });

  it('goes back to the slides', async () => {
    await render();

    button('Volver a las slides')?.click();
    await fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/slides');
  });
});
