import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { formatNumber, type WrapPeriod } from '@wrapped/shared';
import { shortMonth } from '../../core/i18n/intl';
import { LocaleService } from '../../core/i18n/locale.service';

const WIDTH = 300;
const HEIGHT = 72;
/** Keeps the line's stroke inside the box at the peak and at zero. */
const INSET = 2;

let nextId = 0;

/** Contributions per week as a filled line, with its peak and every other month marked. */
@Component({
  selector: 'gw-weekly-chart',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wc-head">
      <span>{{ 'slides.weekly.title' | transloco }}</span>
      @if (peak(); as p) {
        <span class="wc-peak gw-mono">{{ 'slides.weekly.peak' | transloco: p }}</span>
      }
    </div>
    <svg
      class="wc-plot"
      [attr.viewBox]="viewBox"
      preserveAspectRatio="none"
      role="img"
      [attr.aria-label]="
        peak()
          ? ('slides.weekly.label' | transloco: peak() ?? {})
          : ('slides.weekly.empty' | transloco)
      "
    >
      <defs>
        <linearGradient [attr.id]="gradientId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="currentColor" stop-opacity="0.32" />
          <stop offset="1" stop-color="currentColor" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path class="wc-area" [attr.d]="area()" [attr.fill]="'url(#' + gradientId + ')'" />
      <path class="wc-line" [attr.d]="line()" />
    </svg>
    <div class="wc-months" aria-hidden="true">
      @for (month of months(); track month) {
        <span>{{ month }}</span>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--gw-space-2);
      min-height: 0;
      color: var(--gw-ice);
    }
    .wc-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      color: var(--gw-text);
      font-size: var(--gw-text-sm);
    }
    .wc-peak {
      color: var(--gw-text-muted);
      font-size: var(--gw-text-2xs);
    }
    .wc-plot {
      flex: 1;
      width: 100%;
      min-height: 28px;
      overflow: visible;
    }
    .wc-line {
      fill: none;
      stroke: currentColor;
      stroke-width: 1.5;
      stroke-linejoin: round;
      vector-effect: non-scaling-stroke;
    }
    .wc-months {
      display: flex;
      justify-content: space-between;
      color: var(--gw-text-muted);
      font-size: var(--gw-text-2xs);
    }
    /* On short phones the line alone tells the story; the month axis gives way. */
    @container slide (max-height: 540px) {
      .wc-months {
        display: none;
      }
    }
  `,
})
export class WeeklyChartComponent {
  readonly weekly = input.required<readonly number[]>();
  readonly period = input.required<WrapPeriod>();

  private readonly locale = inject(LocaleService).locale;

  protected readonly viewBox = `0 0 ${WIDTH} ${HEIGHT}`;
  protected readonly gradientId = `gw-weekly-${nextId++}`;

  private readonly points = computed(() => {
    const weeks = this.weekly().map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
    const series = weeks.length > 1 ? weeks : [weeks[0] ?? 0, weeks[0] ?? 0];
    const max = Math.max(...series);
    return series.map((v, i) => [
      (i / (series.length - 1)) * WIDTH,
      HEIGHT - INSET - (max > 0 ? (v / max) * (HEIGHT - 2 * INSET) : 0),
    ]);
  });

  protected readonly line = computed(() =>
    this.points()
      .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x?.toFixed(1)} ${y?.toFixed(1)}`)
      .join(' '),
  );
  protected readonly area = computed(() => `${this.line()} L${WIDTH} ${HEIGHT} L0 ${HEIGHT} Z`);

  /** The busiest week, counted from the start of the period; none for a year without activity. */
  protected readonly peak = computed(() => {
    const weeks = this.weekly();
    const max = Math.max(0, ...weeks);
    if (max <= 0) return null;
    return { max: formatNumber(max, this.locale()), week: weeks.indexOf(max) + 1 };
  });

  protected readonly months = computed(() => {
    const last = Number(this.period().to.slice(5, 7)) - 1;
    const months: string[] = [];
    for (let m = 0; m <= last; m += 2) months.push(shortMonth(m, this.locale()));
    return months;
  });
}
