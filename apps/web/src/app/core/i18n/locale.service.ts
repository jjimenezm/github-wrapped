import { isPlatformBrowser } from '@angular/common';
import { DOCUMENT, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { Locale } from '@wrapped/shared';
import { firstValueFrom } from 'rxjs';
import { DEFAULT_LOCALE, isLocale, localeFromBrowser } from './locale';

export const LOCALE_STORAGE_KEY = 'gw.locale';

/**
 * The UI language: the visitor's saved choice, else their browser's. The public wrap page
 * doesn't use this detection; it always shows the wrap's own language.
 */
@Injectable({ providedIn: 'root' })
export class LocaleService {
  private readonly transloco = inject(TranslocoService);
  private readonly document = inject(DOCUMENT);
  private readonly window = isPlatformBrowser(inject(PLATFORM_ID))
    ? this.document.defaultView
    : null;
  private readonly current = signal<Locale>(DEFAULT_LOCALE);
  private latest = 0;

  readonly locale = this.current.asReadonly();

  /** Loads the starting language before the first render, so no key ever flashes. */
  init(): Promise<void> {
    return this.apply(this.stored() ?? localeFromBrowser(this.window?.navigator.languages));
  }

  /** Switches the language in place and remembers it on this device. */
  async use(locale: Locale): Promise<void> {
    this.store(locale);
    await this.apply(locale);
  }

  private async apply(locale: Locale): Promise<void> {
    const request = ++this.latest;
    await firstValueFrom(this.transloco.load(locale));
    // A newer choice may have arrived while this dictionary was loading.
    if (request !== this.latest) return;
    this.transloco.setActiveLang(locale);
    this.current.set(locale);
    this.document.documentElement.lang = locale;
  }

  private stored(): Locale | null {
    try {
      const value = this.window?.localStorage.getItem(LOCALE_STORAGE_KEY);
      return isLocale(value) ? value : null;
    } catch {
      // Storage can be blocked (strict privacy settings, sandboxed iframes).
      return null;
    }
  }

  private store(locale: Locale): void {
    try {
      this.window?.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // Not remembered across visits, but the switch still applies now.
    }
  }
}
