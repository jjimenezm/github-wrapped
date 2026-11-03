import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { WrapPeriod } from '@wrapped/shared';
import { provideI18n } from '../../core/i18n/i18n.providers';
import { WeeklyChartComponent } from './weekly-chart.component';

const PERIOD: WrapPeriod = { year: 2026, from: '2026-01-01', to: '2026-11-03', complete: false };

describe('WeeklyChartComponent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  async function render(weekly: number[]) {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-CL']);
    TestBed.configureTestingModule({ imports: [WeeklyChartComponent], providers: [provideI18n()] });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    const fixture = TestBed.createComponent(WeeklyChartComponent);
    fixture.componentRef.setInput('weekly', weekly);
    fixture.componentRef.setInput('period', PERIOD);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('draws one point per week and names the busiest one', async () => {
    const el = await render([3, 8, 61, 5]);
    const line = el.querySelector('path.wc-line')?.getAttribute('d') ?? '';

    expect(line.match(/[ML]/g)).toHaveLength(4);
    expect(el.textContent?.replace(/\s+/g, ' ')).toContain('máx. 61 · sem. 3');
    expect(el.querySelector('svg')?.getAttribute('aria-label')).toContain('61');
  });

  it('labels every other month of the period', async () => {
    const el = await render([3, 8, 61, 5]);
    const months = [...el.querySelectorAll('.wc-months span')].map((s) => s.textContent?.trim());

    expect(months).toEqual(['ene', 'mar', 'may', 'jul', 'sep', 'nov']);
  });

  it('stays flat and quiet for a year without activity', async () => {
    const el = await render([0, 0, 0]);

    expect(el.textContent).not.toContain('máx.');
    expect(el.querySelector('path.wc-line')).not.toBeNull();
  });
});
