import { loadConfig } from './config';

describe('loadConfig', () => {
  it('reads the token, Redis and the preview rate limit', () => {
    expect(
      loadConfig({
        GITHUB_SERVER_TOKEN: 'ghs_x',
        REDIS_URL: 'redis://localhost:6379',
        RATE_LIMIT_PREVIEW_MAX: '7',
        RATE_LIMIT_PREVIEW_WINDOW_SECONDS: '60',
      }),
    ).toEqual({
      production: false,
      githubToken: 'ghs_x',
      fixturesDir: null,
      redisUrl: 'redis://localhost:6379',
      rateLimit: { preview: { max: 7, windowSeconds: 60 } },
    });
  });

  it('defaults the preview limit to 20 lookups per 10 minutes', () => {
    expect(loadConfig({ GITHUB_SERVER_TOKEN: 'ghs_x' }).rateLimit.preview).toEqual({
      max: 20,
      windowSeconds: 600,
    });
  });

  it('accepts fixtures instead of a token outside production', () => {
    expect(loadConfig({ GITHUB_FIXTURES_DIR: '/fixtures' }).fixturesDir).toBe('/fixtures');
  });

  it('needs a token or fixtures', () => {
    expect(() => loadConfig({})).toThrow(/GITHUB_SERVER_TOKEN/);
  });

  it('never serves fixtures in production', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        GITHUB_SERVER_TOKEN: 'ghs_x',
        REDIS_URL: 'redis://r',
        GITHUB_FIXTURES_DIR: '/f',
      }),
    ).toThrow(/GITHUB_FIXTURES_DIR/);
  });

  it('needs Redis in production, where several requests share the cache and the limits', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', GITHUB_SERVER_TOKEN: 'ghs_x' })).toThrow(
      /REDIS_URL/,
    );
  });

  it('rejects a limit that is not a positive integer', () => {
    expect(() =>
      loadConfig({ GITHUB_SERVER_TOKEN: 'ghs_x', RATE_LIMIT_PREVIEW_MAX: 'many' }),
    ).toThrow(/RATE_LIMIT_PREVIEW_MAX/);
  });
});
