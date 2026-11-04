import { ApplicationInitStatus, DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { provideI18n } from './i18n.providers';
import { LOCALE_STORAGE_KEY, LocaleService } from './locale.service';

describe('LocaleService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  async function start(languages: string[]): Promise<LocaleService> {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);
    TestBed.configureTestingModule({ providers: [provideI18n()] });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    return TestBed.inject(LocaleService);
  }

  const active = () => TestBed.inject(TranslocoService).getActiveLang();
  const htmlLang = () => TestBed.inject(DOCUMENT).documentElement.lang;

  it('shows a wrap in its own language without remembering it as the visitor’s', async () => {
    const locale = await start(['es-CL']);

    await locale.showWrap('en');

    expect(active()).toBe('en');
    expect(locale.locale()).toBe('en');
    expect(htmlLang()).toBe('en');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
  });

  it('goes back to the visitor’s language after the wrap', async () => {
    const locale = await start(['es-CL']);
    await locale.showWrap('en');

    await locale.restore();

    expect(active()).toBe('es');
    expect(htmlLang()).toBe('es');
  });

  it('keeps a choice made while a wrap was on screen', async () => {
    const locale = await start(['es-CL']);
    await locale.showWrap('es');
    await locale.use('en');

    await locale.restore();

    expect(active()).toBe('en');
  });
});
