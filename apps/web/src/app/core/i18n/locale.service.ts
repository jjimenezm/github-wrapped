import { isPlatformBrowser } from '@angular/common';
import { DOCUMENT, Injectable, PLATFORM_ID, REQUEST, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { Locale } from '@wrapped/shared';
import { firstValueFrom } from 'rxjs';
import { DEFAULT_LOCALE, isLocale, localeFromBrowser } from './locale';

export const LOCALE_STORAGE_KEY = 'gw.locale';

/**
 * The UI language: the visitor's saved choice, else their browser's (on the server, the request's
 * Accept-Language). The public wrap page shows the wrap's own language instead, without
 * touching the visitor's choice, and gives it back when they leave.
 */
@Injectable({ providedIn: 'root' })
export class LocaleService {
  private readonly transloco = inject(TranslocoService);
  private readonly document = inject(DOCUMENT);
  private readonly window = isPlatformBrowser(inject(PLATFORM_ID))
    ? this.document.defaultView
    : null;
  private readonly request = inject(REQUEST, { optional: true });
  private readonly current = signal<Locale>(DEFAULT_LOCALE);
  private latest = 0;
  private showingWrap = false;

  readonly locale = this.current.asReadonly();

  /** Loads the starting language before the first render, so no key ever flashes. */
  init(): Promise<void> {
    return this.apply(this.preferred());
  }

  /** Switches the language in place and remembers it on this device. */
  async use(locale: Locale): Promise<void> {
    this.showingWrap = false;
    this.store(locale);
    await this.apply(locale);
  }

  /** A wrap's page speaks the wrap's language, whatever the visitor's (R17). */
  showWrap(locale: Locale): Promise<void> {
    this.showingWrap = true;
    return this.apply(locale);
  }

  /** Leaving a wrap's page: back to the visitor's own language, unless they picked one there. */
  restore(): Promise<void> {
    if (!this.showingWrap) return Promise.resolve();
    this.showingWrap = false;
    return this.apply(this.preferred());
  }

  private preferred(): Locale {
    return this.stored() ?? localeFromBrowser(this.window?.navigator.languages ?? this.requested());
  }

  /** `es-CL,es;q=0.9,en;q=0.8` → `['es-CL', 'es', 'en']`, for the server's first render. */
  private requested(): string[] | undefined {
    const header = this.request?.headers.get('accept-language');
    return header?.split(',').map((part) => part.split(';')[0]?.trim() ?? '');
  }

  private async apply(locale: Locale): Promise<void> {
    const request = ++this.latest;
    // Transloco completes empty once the app is going away (end of a server render): nothing to do.
    const dictionary = await firstValueFrom(this.transloco.load(locale), { defaultValue: null });
    // A newer choice may have arrived while this dictionary was loading.
    if (dictionary === null || request !== this.latest) return;
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
