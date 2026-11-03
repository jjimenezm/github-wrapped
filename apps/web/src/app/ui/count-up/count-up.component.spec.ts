import { ApplicationInitStatus } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { installMatchMedia, type FakeMatchMedia } from '../../../testing/match-media';
import { provideI18n } from '../../core/i18n/i18n.providers';
import { COUNT_UP_MS, CountUpComponent } from './count-up.component';

const REDUCE = '(prefers-reduced-motion: reduce)';

describe('CountUpComponent', () => {
  let media: FakeMatchMedia;

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    media.restore();
    localStorage.clear();
  });

  async function render(value: number, { reduce = false, languages = ['es-CL'] } = {}) {
    media = installMatchMedia({ [REDUCE]: reduce });
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);
    TestBed.configureTestingModule({ imports: [CountUpComponent], providers: [provideI18n()] });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
      ],
    });
    const fixture = TestBed.createComponent(CountUpComponent);
    fixture.componentRef.setInput('value', value);
    fixture.detectChanges();
    return fixture;
  }

  const shown = (fixture: ComponentFixture<CountUpComponent>) =>
    (fixture.nativeElement as HTMLElement)
      .querySelector('[aria-hidden="true"]')
      ?.textContent?.trim();
  const spoken = (fixture: ComponentFixture<CountUpComponent>) =>
    (fixture.nativeElement as HTMLElement)
      .querySelector('.gw-visually-hidden')
      ?.textContent?.trim();

  function frames(fixture: ComponentFixture<CountUpComponent>, ms: number): void {
    vi.advanceTimersByTime(ms);
    fixture.detectChanges();
  }

  it('counts up from zero and lands exactly on the value', async () => {
    const fixture = await render(1284);
    const seen: number[] = [];

    for (let t = 0; t < COUNT_UP_MS + 100; t += 100) {
      frames(fixture, 100);
      seen.push(Number(shown(fixture)?.replace(/\D/g, '')));
    }

    expect(seen[0]).toBeGreaterThan(0);
    expect(seen[0]).toBeLessThan(1284);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(shown(fixture)).toBe('1.284');
  });

  it('gives screen readers the final value from the start', async () => {
    const fixture = await render(1284);

    expect(spoken(fixture)).toBe('1.284');
  });

  it('shows the value at once when the person prefers less motion', async () => {
    const fixture = await render(1284, { reduce: true });

    expect(shown(fixture)).toBe('1.284');
  });

  it('formats for the active language', async () => {
    const fixture = await render(1284, { reduce: true, languages: ['en-US'] });

    expect(shown(fixture)).toBe('1,284');
  });
});
