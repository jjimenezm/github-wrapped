import { authUrl } from './auth-url';

describe('authUrl', () => {
  const params = (url: string) => Object.fromEntries(new URL(url, 'http://x').searchParams);

  it('asks GitHub who you are before publishing a card in a language', () => {
    const url = authUrl({ intent: 'publish', login: 'ana-dev', style: 'cordillera', locale: 'en' });

    expect(url.startsWith('/api/auth/github?')).toBe(true);
    expect(params(url)).toEqual({
      login: 'ana-dev',
      intent: 'publish',
      style: 'cordillera',
      locale: 'en',
    });
  });

  it('asks again to change the card of a published year', () => {
    const url = authUrl({ intent: 'change-card', login: 'ana-dev', style: 'huella', year: 2026 });

    expect(params(url)).toEqual({
      login: 'ana-dev',
      intent: 'change-card',
      style: 'huella',
      year: '2026',
    });
  });

  it('asks again to manage a published year, with nothing else to change', () => {
    const url = authUrl({ intent: 'manage', login: 'ana-dev', year: 2026 });

    expect(params(url)).toEqual({ login: 'ana-dev', intent: 'manage', year: '2026' });
  });

  it('encodes what goes in the query', () => {
    const url = authUrl({ intent: 'publish', login: 'a&b=c', style: 'huella', locale: 'es' });

    expect(params(url)['login']).toBe('a&b=c');
  });
});
