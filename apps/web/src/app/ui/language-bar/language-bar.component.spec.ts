import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { LanguageShare } from '@wrapped/shared';
import { provideI18n } from '../../core/i18n/i18n.providers';
import { LanguageBarComponent } from './language-bar.component';

const LANGUAGES: LanguageShare[] = [
  { name: 'TypeScript', color: '#3178c6', bytes: 480 },
  { name: 'PHP', color: '#4F5D95', bytes: 310 },
  { name: 'Odin', color: null, bytes: 110 },
];

describe('LanguageBarComponent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  async function render(languages: LanguageShare[], otherBytes: number) {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-CL']);
    TestBed.configureTestingModule({ imports: [LanguageBarComponent], providers: [provideI18n()] });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    const fixture = TestBed.createComponent(LanguageBarComponent);
    fixture.componentRef.setInput('languages', languages);
    fixture.componentRef.setInput('otherBytes', otherBytes);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const legend = (el: HTMLElement) =>
    [...el.querySelectorAll('li')].map((li) => li.textContent?.replace(/\s+/g, ' ').trim());

  it('splits the bar by bytes, counting the rest as "Otros"', async () => {
    const el = await render(LANGUAGES, 100);
    const widths = [...el.querySelectorAll<HTMLElement>('.lb-bar span')].map(
      (s) => s.style.flexGrow,
    );

    expect(widths).toEqual(['480', '310', '110', '100']);
    expect(legend(el)).toEqual(['TypeScript 48%', 'PHP 31%', 'Odin 11%', 'Otros']);
  });

  it('leaves "Otros" out when every byte is in the top three', async () => {
    const el = await render(LANGUAGES, 0);

    expect(legend(el)).not.toContain('Otros');
  });

  it('gives a language without a GitHub color the neutral swatch', async () => {
    const el = await render(LANGUAGES, 0);
    const odin = el.querySelectorAll<HTMLElement>('.lb-bar span')[2];

    expect(odin?.style.background).not.toBe('');
    expect(odin?.style.background).not.toContain('null');
  });
});
