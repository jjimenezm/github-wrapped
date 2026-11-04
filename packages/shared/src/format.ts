import type { Locale, WrapSnapshot } from './types';
import type { WrapPeriod } from './year-rule';

const INTL_LOCALE: Record<Locale, string> = { es: 'es-CL', en: 'en-US' };

/** Thousands are always grouped, so 1284 reads "1.284" in Spanish and "1,284" in English. */
export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], { useGrouping: 'always' }).format(value);
}

function monthName(period: WrapPeriod, month: number, style: 'long' | 'short', locale: Locale) {
  const date = new Date(Date.UTC(period.year, month, 1));
  const name = new Intl.DateTimeFormat(INTL_LOCALE[locale], { month: style, timeZone: 'UTC' })
    .format(date)
    // Some ICU versions abbreviate Spanish months with a trailing dot ("feb.").
    .replace(/\.$/, '');
  return name;
}

const endMonth = (period: WrapPeriod) => Number(period.to.slice(5, 7)) - 1;

/** "Hasta febrero de 2026" / "Through February 2026", or "Todo 2026" / "All of 2026". */
export function periodLabel(period: WrapPeriod, locale: Locale): string {
  if (period.complete) {
    return locale === 'es' ? `Todo ${period.year}` : `All of ${period.year}`;
  }
  const month = monthName(period, endMonth(period), 'long', locale);
  return locale === 'es' ? `Hasta ${month} de ${period.year}` : `Through ${month} ${period.year}`;
}

/** "ene–feb 2026" / "Jan–Feb 2026". */
export function periodChip(period: WrapPeriod, locale: Locale): string {
  const first = monthName(period, 0, 'short', locale);
  const last = monthName(period, endMonth(period), 'short', locale);
  return `${first}–${last} ${period.year}`;
}

/** Rounded percentage change; null when it can't be computed honestly (unknown or zero baseline). */
export function yearOverYear(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) {
    return null;
  }
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * The text a share on X carries, in the wrap's language: how far the year goes and the
 * contributions, or no number at all when it failed to load (it is never estimated).
 */
export function shareText(
  snapshot: { period: WrapPeriod; metrics: Pick<WrapSnapshot['metrics'], 'contributions'> },
  locale: Locale,
): string {
  const { period } = snapshot;
  const total = snapshot.metrics.contributions;
  const month = period.complete ? null : monthName(period, endMonth(period), 'long', locale);
  if (locale === 'es') {
    const head = `Mi ${period.year} en GitHub${month ? `, hasta ${month}` : ''}`;
    if (total === null) return `${head}.`;
    return `${head}: ${formatNumber(total, locale)} ${total === 1 ? 'contribución' : 'contribuciones'}.`;
  }
  const head = `My ${period.year} on GitHub${month ? ` through ${month}` : ''}`;
  if (total === null) return `${head}.`;
  return `${head}: ${formatNumber(total, locale)} ${total === 1 ? 'contribution' : 'contributions'}.`;
}
