export interface RateLimitRule {
  max: number;
  windowSeconds: number;
}

export interface AppConfig {
  production: boolean;
  /** Server token with public read-only access; never a user's token. */
  githubToken: string | null;
  /** Fixture mode: GitHub answers come from JSON files (tests and local development only). */
  fixturesDir: string | null;
  redisUrl: string | null;
  rateLimit: { preview: RateLimitRule };
}

export type RateLimitName = keyof AppConfig['rateLimit'];

export const APP_CONFIG = Symbol('APP_CONFIG');

type Env = Record<string, string | undefined>;

const value = (env: Env, name: string) => env[name]?.trim() || null;

function positiveInt(env: Env, name: string, fallback: number): number {
  const raw = value(env, name);
  if (raw === null) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  }
  return parsed;
}

/** Reads and checks the environment once at boot, so a bad deploy fails loudly instead of later. */
export function loadConfig(env: Env): AppConfig {
  const production = env.NODE_ENV === 'production';
  const githubToken = value(env, 'GITHUB_SERVER_TOKEN');
  const fixturesDir = value(env, 'GITHUB_FIXTURES_DIR');
  const redisUrl = value(env, 'REDIS_URL');

  if (production && fixturesDir) {
    throw new Error(
      'GITHUB_FIXTURES_DIR is for tests and development; it is not allowed in production',
    );
  }
  if (!githubToken && !fixturesDir) {
    throw new Error('Set GITHUB_SERVER_TOKEN (or GITHUB_FIXTURES_DIR outside production)');
  }
  if (production && !redisUrl) {
    throw new Error('REDIS_URL is required in production: the cache and rate limits are shared');
  }

  return {
    production,
    githubToken,
    fixturesDir,
    redisUrl,
    rateLimit: {
      preview: {
        max: positiveInt(env, 'RATE_LIMIT_PREVIEW_MAX', 20),
        windowSeconds: positiveInt(env, 'RATE_LIMIT_PREVIEW_WINDOW_SECONDS', 600),
      },
    },
  };
}
