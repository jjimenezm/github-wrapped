import { Locale, SUPPORTED_LOCALES } from '@wrapped/shared';

export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(value: unknown): value is Locale {
  return (SUPPORTED_LOCALES as readonly unknown[]).includes(value);
}

/** Spanish when the browser's preferred language is any `es` variant; English otherwise. */
export function localeFromBrowser(languages: readonly string[] | undefined): Locale {
  const preferred = languages?.[0];
  return preferred && /^es(-|$)/i.test(preferred) ? 'es' : DEFAULT_LOCALE;
}
