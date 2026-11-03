import {
  EnvironmentProviders,
  Injectable,
  inject,
  isDevMode,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { Translation, TranslocoLoader, provideTransloco } from '@jsverse/transloco';
import { Locale, SUPPORTED_LOCALES } from '@wrapped/shared';
import { from } from 'rxjs';
import { DEFAULT_LOCALE } from './locale';
import { LocaleService } from './locale.service';

const DICTIONARIES: Record<Locale, () => Promise<{ default: Translation }>> = {
  es: () => import('../../../i18n/es.json'),
  en: () => import('../../../i18n/en.json'),
};

/** Dictionaries ship as lazy chunks: no HTTP round trip, and they load the same on the server. */
@Injectable({ providedIn: 'root' })
class BundledDictionaryLoader implements TranslocoLoader {
  getTranslation(lang: string) {
    return from(DICTIONARIES[lang as Locale]().then((module) => module.default));
  }
}

export function provideI18n(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideTransloco({
      config: {
        availableLangs: [...SUPPORTED_LOCALES],
        defaultLang: DEFAULT_LOCALE,
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: BundledDictionaryLoader,
    }),
    provideAppInitializer(() => inject(LocaleService).init()),
  ]);
}
