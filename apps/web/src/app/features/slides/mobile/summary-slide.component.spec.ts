import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { sourceUrl, type WrapSnapshot } from '@wrapped/shared';
import { installMatchMedia, type FakeMatchMedia } from '../../../../testing/match-media';
import { demoSnapshot } from '../../../../testing/snapshot';
import { provideI18n } from '../../../core/i18n/i18n.providers';
import { SummarySlideComponent } from './summary-slide.component';

describe('SummarySlideComponent', () => {
  let media: FakeMatchMedia;

  afterEach(() => {
    vi.restoreAllMocks();
    media.restore();
    localStorage.clear();
  });

  async function render(snapshot: WrapSnapshot, languages = ['es-CL']) {
    media = installMatchMedia({ '(prefers-reduced-motion: reduce)': true });
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);
    TestBed.configureTestingModule({
      imports: [SummarySlideComponent],
      providers: [provideI18n()],
    });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    const fixture = TestBed.createComponent(SummarySlideComponent);
    fixture.componentRef.setInput('snapshot', snapshot);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (el: Element | null | undefined) =>
    el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const cards = (el: HTMLElement) => [...el.querySelectorAll('.metric')].map(text);

  it('shows the period and the contributions', async () => {
    const el = await render(demoSnapshot());

    expect(text(el.querySelector('.period'))).toBe('Hasta noviembre de 2026');
    expect(text(el.querySelector('.total'))).toContain('1.284');
    expect(text(el.querySelector('.total'))).toContain('contribuciones');
  });

  it('calls a finished year "Todo 2026"', async () => {
    const el = await render(
      demoSnapshot({
        period: { year: 2026, from: '2026-01-01', to: '2026-12-31', complete: true },
      }),
    );

    expect(text(el.querySelector('.period'))).toBe('Todo 2026');
  });

  it('puts growth in green with the previous period and the active days', async () => {
    const el = await render(demoSnapshot());
    const context = el.querySelector('.context');

    expect(text(context)).toBe('↑ 23% vs. ene–nov 2025 · 214 días activos');
    expect(context?.querySelector('.delta')?.classList).toContain('delta--up');
  });

  it('shows a drop in a neutral color, not green', async () => {
    const el = await render(
      demoSnapshot({ metrics: { ...demoSnapshot().metrics, contributions: 960 } }),
    );
    const delta = el.querySelector('.context .delta');

    expect(text(delta)).toBe('↓ 8%');
    expect(delta?.classList).not.toContain('delta--up');
  });

  it('leaves the comparison out when there is nothing honest to compare', async () => {
    const el = await render(demoSnapshot({ previousContributions: null }));

    expect(text(el.querySelector('.context'))).toBe('214 días activos');
  });

  it('draws one card per metric, each with its source on GitHub', async () => {
    const snapshot = demoSnapshot();
    const el = await render(snapshot);

    expect(cards(el)).toEqual([
      '312 commits',
      '86 PRs mergeados',
      '41 code reviews',
      '19 issues abiertos',
    ]);
    const commits = el.querySelector<HTMLAnchorElement>('.metric a');
    expect(commits?.href).toBe(sourceUrl('commits', 'ana-dev', snapshot.period));
    expect(commits?.target).toBe('_blank');
    expect(commits?.rel).toContain('noopener');
    expect(commits?.getAttribute('aria-label')).toBe('Ver commits en GitHub');
  });

  it('hides a metric that failed instead of showing a 0', async () => {
    const el = await render(
      demoSnapshot({ metrics: { ...demoSnapshot().metrics, mergedPRs: null } }),
    );

    expect(cards(el)).toEqual(['312 commits', '41 code reviews', '19 issues abiertos']);
    expect(el.querySelector('.metrics')?.textContent).not.toMatch(/(^|\s)0(\s|$)/);
  });

  it('turns private work into its own card when GitHub hides the details', async () => {
    const el = await render(
      demoSnapshot({
        metrics: { contributions: 1408, commits: 7, mergedPRs: 0, reviews: 0, issues: 0 },
        privateContributions: 1400,
      }),
    );

    expect(cards(el)).toEqual(['7 commits', '1.400 en repos privados']);
    const lock = el.querySelectorAll('.metric')[1];
    expect(lock?.querySelector('a')).toBeNull();
  });

  it('drops the cards altogether for a year with nothing to count', async () => {
    const el = await render(
      demoSnapshot({
        metrics: { contributions: 0, commits: 0, mergedPRs: 0, reviews: 0, issues: 0 },
      }),
    );

    expect(el.querySelector('.metrics')).toBeNull();
  });

  it('skips the languages panel when there are none', async () => {
    const el = await render(demoSnapshot({ languages: [], otherLanguagesBytes: 0 }));

    expect(el.querySelector('gw-language-bar')).toBeNull();
  });

  it('dates the data in the footer', async () => {
    const el = await render(demoSnapshot());

    expect(text(el.querySelector('.source'))).toBe(
      'Datos públicos de GitHub · actualizado al 3 nov 2026',
    );
  });

  it('reads in English too', async () => {
    const el = await render(demoSnapshot(), ['en-US']);

    expect(text(el.querySelector('.period'))).toBe('Through November 2026');
    expect(text(el.querySelector('.context'))).toBe('↑ 23% vs. Jan–Nov 2025 · 214 active days');
    expect(cards(el)).toContain('86 merged PRs');
  });
});
