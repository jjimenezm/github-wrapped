import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  formatNumber,
  periodChip,
  periodLabel,
  previousYearPeriod,
  sourceUrl,
  yearOverYear,
  type WrapSnapshot,
} from '@wrapped/shared';
import { formatPercent, formatShortDate } from '../../../core/i18n/intl';
import { LocaleService } from '../../../core/i18n/locale.service';
import { CountUpComponent } from '../../../ui/count-up/count-up.component';
import { IconComponent } from '../../../ui/icon/icon.component';
import type { OcticonName } from '../../../ui/icon/octicons';
import { LanguageBarComponent } from '../../../ui/language-bar/language-bar.component';
import { WeeklyChartComponent } from '../../../ui/weekly-chart/weekly-chart.component';

const PUBLIC_METRICS = [
  { key: 'commits', icon: 'git-commit' },
  { key: 'mergedPRs', icon: 'git-pull-request' },
  { key: 'reviews', icon: 'code' },
  { key: 'issues', icon: 'issue-opened' },
] as const satisfies readonly { key: string; icon: OcticonName }[];

interface MetricCard {
  key: string;
  icon: OcticonName;
  value: string;
  label: string;
  /** Where GitHub backs the number (R11); private work has no public view, so no link. */
  source: { href: string; label: string } | null;
}

/**
 * Slide 1: the year in one number, then what's behind it. A metric that failed (null) or is 0
 * gets no card: zero isn't a highlight, and a failure is never shown as one (R10). Contributions
 * to private repos, which GitHub reports only as a total, get a card of their own.
 */
@Component({
  selector: 'gw-summary-slide',
  imports: [
    TranslocoPipe,
    CountUpComponent,
    IconComponent,
    LanguageBarComponent,
    WeeklyChartComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './summary-slide.component.html',
  styleUrl: './summary-slide.component.css',
})
export class SummarySlideComponent {
  readonly snapshot = input.required<WrapSnapshot>();

  private readonly transloco = inject(TranslocoService);
  private readonly locale = inject(LocaleService).locale;

  private readonly t = (key: string, params: Record<string, unknown> = {}) =>
    this.transloco.translate(key, params, this.locale());

  protected readonly period = computed(() => periodLabel(this.snapshot().period, this.locale()));

  protected readonly contributionsSource = computed(() => {
    const { login, period } = this.snapshot();
    return sourceUrl('contributions', login, period);
  });

  /** "↑ 23 %", green only when it grew; null when there is no honest baseline. */
  protected readonly delta = computed(() => {
    const { metrics, previousContributions } = this.snapshot();
    const change = yearOverYear(metrics.contributions, previousContributions);
    if (change === null) return null;
    const arrow = change > 0 ? '↑ ' : change < 0 ? '↓ ' : '';
    return { text: arrow + formatPercent(Math.abs(change), this.locale()), up: change > 0 };
  });

  /** "vs. ene–nov 2025 · 214 días activos", whichever parts exist. */
  protected readonly context = computed(() => {
    const { period, activeDays } = this.snapshot();
    const locale = this.locale();
    const parts: string[] = [];
    if (this.delta()) {
      const previous = {
        ...previousYearPeriod(period),
        year: period.year - 1,
        complete: period.complete,
      };
      parts.push(this.t('slides.summary.versus', { period: periodChip(previous, locale) }));
    }
    if (activeDays !== null) {
      parts.push(this.t('slides.summary.activeDays', { count: formatNumber(activeDays, locale) }));
    }
    return parts.join(' · ');
  });

  protected readonly cards = computed((): MetricCard[] => {
    const { metrics, login, period, privateContributions } = this.snapshot();
    const locale = this.locale();
    const cards: MetricCard[] = [];
    for (const { key, icon } of PUBLIC_METRICS) {
      const value = metrics[key];
      if (value === null || value <= 0) continue;
      const label = this.t(`slides.summary.metrics.${key}`);
      cards.push({
        key,
        icon,
        value: formatNumber(value, locale),
        label,
        source: {
          href: sourceUrl(key, login, period),
          label: this.t('slides.summary.source', { metric: label }),
        },
      });
    }
    if (privateContributions > 0) {
      cards.push({
        key: 'private',
        icon: 'lock',
        value: formatNumber(privateContributions, locale),
        label: this.t('slides.summary.metrics.private'),
        source: null,
      });
    }
    return cards;
  });

  protected readonly updated = computed(() =>
    this.t('slides.summary.updated', {
      date: formatShortDate(this.snapshot().generatedAt, this.locale()),
    }),
  );
}
