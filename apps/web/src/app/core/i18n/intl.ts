import type { Locale } from '@wrapped/shared';

/** The regional formats each UI language uses (dates, units, percentages). */
export const INTL_LOCALE: Record<Locale, string> = { es: 'es-CL', en: 'en-US' };

/** A whole-number percentage: "23 %" in Spanish, "23%" in English. */
export function formatPercent(value: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], { style: 'percent' }).format(value / 100);
}

/** "3 nov 2026" / "Nov 3, 2026" for an ISO date or timestamp, read in UTC like the data. */
export function formatShortDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(new Date(iso))
    .replace(/\./g, '');
}

/** "4 de noviembre, 12:30" / "November 4 at 12:30 PM", in the visitor's own time zone. */
export function formatDateTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: locale === 'en',
  }).format(new Date(iso));
}

/** "ene" / "Jan" for a zero-based month: always three letters, so axis labels line up. */
export function shortMonth(month: number, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(2000, month, 1)))
    .replace(/\./g, '')
    .slice(0, 3);
}
