import en from '../../../i18n/en.json';
import es from '../../../i18n/es.json';
import { localeFromBrowser } from './locale';

function keys(dictionary: object, prefix = ''): string[] {
  return Object.entries(dictionary).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null ? keys(value, `${prefix}${key}.`) : [prefix + key],
  );
}

describe('dictionaries', () => {
  it('have the same keys in Spanish and English', () => {
    expect(keys(es).sort()).toEqual(keys(en).sort());
  });
});

describe('localeFromBrowser', () => {
  it.each([
    [['es-CL', 'en'], 'es'],
    [['es'], 'es'],
    [['es-419'], 'es'],
    [['ES-ar'], 'es'],
    [['de-DE', 'es-CL'], 'en'],
    [['en-US'], 'en'],
    [['et-EE'], 'en'],
    [['esperanto'], 'en'],
    [[], 'en'],
    [undefined, 'en'],
  ] as const)('maps %j to %s using the first preferred language', (languages, expected) => {
    expect(localeFromBrowser(languages)).toBe(expected);
  });
});
