import { loadConfig } from './config';

const SECRET = 's'.repeat(32);
const devSecret = () => 'generated-development-secret-0123456789';

/** Everything production needs; tests remove one piece at a time. */
const PRODUCTION = {
  NODE_ENV: 'production',
  GITHUB_SERVER_TOKEN: 'ghs_x',
  REDIS_URL: 'redis://r:6379',
  DATABASE_URL: 'postgresql://u:p@db:5432/wrapped',
  PUBLIC_BASE_URL: 'https://wrapped.jjimenezm.dev',
  FILES_DIR: '/data/files',
  SESSION_SECRET: SECRET,
  GITHUB_OAUTH_CLIENT_ID: 'Iv1.client',
  GITHUB_OAUTH_CLIENT_SECRET: 'oauth-secret',
};

describe('loadConfig', () => {
  it('reads a complete production environment', () => {
    expect(
      loadConfig({ ...PRODUCTION, RATE_LIMIT_PREVIEW_MAX: '7', RATE_LIMIT_PUBLISH_MAX: '3' }),
    ).toEqual({
      production: true,
      githubToken: 'ghs_x',
      fixturesDir: null,
      redisUrl: 'redis://r:6379',
      databaseUrl: 'postgresql://u:p@db:5432/wrapped',
      publicBaseUrl: 'https://wrapped.jjimenezm.dev',
      apiBaseUrl: 'https://wrapped.jjimenezm.dev',
      filesDir: '/data/files',
      sessionSecret: SECRET,
      oauth: { clientId: 'Iv1.client', clientSecret: 'oauth-secret' },
      rateLimit: {
        preview: { max: 7, windowSeconds: 600 },
        publish: { max: 3, windowSeconds: 3600 },
      },
    });
  });

  it('has local defaults for development: web on 4200, api on 3000, a throwaway secret', () => {
    const config = loadConfig({ GITHUB_FIXTURES_DIR: '/fixtures' }, devSecret);
    expect(config).toMatchObject({
      production: false,
      databaseUrl: null,
      publicBaseUrl: 'http://localhost:4200',
      apiBaseUrl: 'http://localhost:3000',
      sessionSecret: 'generated-development-secret-0123456789',
      oauth: { clientId: null, clientSecret: null },
      rateLimit: {
        preview: { max: 20, windowSeconds: 600 },
        publish: { max: 10, windowSeconds: 3600 },
      },
    });
    expect(config.filesDir).toMatch(/github-wrapped-files$/);
  });

  it('trims a trailing slash from the base URLs', () => {
    const config = loadConfig({
      ...PRODUCTION,
      PUBLIC_BASE_URL: 'https://wrapped.jjimenezm.dev/',
      API_BASE_URL: 'https://api.example.dev/',
    });
    expect(config.publicBaseUrl).toBe('https://wrapped.jjimenezm.dev');
    expect(config.apiBaseUrl).toBe('https://api.example.dev');
  });

  it('needs a token or fixtures', () => {
    expect(() => loadConfig({}, devSecret)).toThrow(/GITHUB_SERVER_TOKEN/);
  });

  it('needs the OAuth app outside fixture mode', () => {
    expect(() => loadConfig({ GITHUB_SERVER_TOKEN: 'ghs_x' }, devSecret)).toThrow(
      /GITHUB_OAUTH_CLIENT_ID/,
    );
  });

  it('never serves fixtures (or the fake OAuth that comes with them) in production', () => {
    expect(() => loadConfig({ ...PRODUCTION, GITHUB_FIXTURES_DIR: '/f' })).toThrow(
      /GITHUB_FIXTURES_DIR/,
    );
  });

  it.each([
    'REDIS_URL',
    'DATABASE_URL',
    'PUBLIC_BASE_URL',
    'FILES_DIR',
    'SESSION_SECRET',
    'GITHUB_OAUTH_CLIENT_ID',
    'GITHUB_OAUTH_CLIENT_SECRET',
  ])('needs %s in production', (name) => {
    const env: Record<string, string | undefined> = { ...PRODUCTION, [name]: undefined };
    expect(() => loadConfig(env)).toThrow(new RegExp(name));
  });

  it('rejects a session secret shorter than 32 characters', () => {
    expect(() => loadConfig({ ...PRODUCTION, SESSION_SECRET: 'short' })).toThrow(/SESSION_SECRET/);
  });

  it('serves the public site over https in production', () => {
    expect(() => loadConfig({ ...PRODUCTION, PUBLIC_BASE_URL: 'http://wrapped.dev' })).toThrow(
      /https/,
    );
  });

  it('rejects a limit that is not a positive integer', () => {
    expect(() => loadConfig({ ...PRODUCTION, RATE_LIMIT_PREVIEW_MAX: 'many' })).toThrow(
      /RATE_LIMIT_PREVIEW_MAX/,
    );
  });
});
