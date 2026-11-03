import type { Locale } from '@wrapped/shared';
import { INTL_LOCALE } from './intl';

/** "30 segundos" / "30 seconds" under a minute, else whole minutes rounded up ("2 minutos"). */
export function formatWait(seconds: number, locale: Locale): string {
  const [value, unit] =
    seconds < 60 ? [Math.ceil(seconds), 'second'] : [Math.ceil(seconds / 60), 'minute'];
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: 'unit',
    unit,
    unitDisplay: 'long',
  }).format(value);
}
