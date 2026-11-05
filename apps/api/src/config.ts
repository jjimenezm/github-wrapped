import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface RateLimitRule {
  max: number;
  windowSeconds: number;
}

export interface AppConfig {
  production: boolean;
  /** Server token with public read-only access; never a user's token. */
  githubToken: string | null;
  /** Fixture mode: GitHub data and OAuth answered locally (tests and development only). */
  fixturesDir: string | null;
  redisUrl: string | null;
  /** Postgres for the wraps; without it (outside production) they live in memory. */
  databaseUrl: string | null;
  /** The web origin: QR codes, share links and where OAuth sends people back. */
  publicBaseUrl: string;
  /** Where the api answers, for the OAuth callback (the same origin in production). */
  apiBaseUrl: string;
  /** Shared volume for the PNGs and MP4s of each wrap. */
  filesDir: string;
  sessionSecret: string;
  /** The GitHub OAuth app; unused in fixture mode. */
  oauth: { clientId: string | null; clientSecret: string | null };
  rateLimit: { preview: RateLimitRule; publish: RateLimitRule };
  /**
   * Proxies in front of the api, each appending the address it saw to X-Forwarded-For: 1 for
   * Traefik alone, 2 with Cloudflare's proxy in front of it. The client IP (rate limits) is the
   * entry that many hops back, so nothing a client adds to the header can change it.
   */
  trustProxyHops: number;
  video: VideoConfig;
}

export interface VideoConfig {
  /**
   * RENDER_VIDEO_ENABLED, the same switch the renderer reads: publishing and regenerating queue a
   * video. Off, wraps keep `videoStatus = none` and the web shows no video at all.
   */
  enabled: boolean;
  /**
   * PUBLIC_MEDIA_URL: the origin videos play from when they live in object storage (a bucket with
   * its own domain). Unset, they live on the shared volume and the api serves them.
   */
  mediaBaseUrl: string | null;
}

export type RateLimitName = keyof AppConfig['rateLimit'];

export const APP_CONFIG = Symbol('APP_CONFIG');

type Env = Record<string, string | undefined>;

const MIN_SECRET_LENGTH = 32;

const value = (env: Env, name: string) => env[name]?.trim() || null;
const withoutTrailingSlash = (url: string) => url.replace(/\/+$/, '');

function positiveInt(env: Env, name: string, fallback: number): number {
  const raw = value(env, name);
  if (raw === null) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  }
  return parsed;
}

function required(env: Env, name: string, why: string): string {
  const found = value(env, name);
  if (!found) throw new Error(`${name} is required in production: ${why}`);
  return found;
}

/**
 * Reads and checks the environment once at boot, so a bad deploy fails loudly instead of later.
 * Outside production everything has a local default; production must spell everything out.
 */
export function loadConfig(
  env: Env,
  devSecret: () => string = () => randomBytes(32).toString('hex'),
): AppConfig {
  const production = env.NODE_ENV === 'production';
  const githubToken = value(env, 'GITHUB_SERVER_TOKEN');
  const fixturesDir = value(env, 'GITHUB_FIXTURES_DIR');

  if (production && fixturesDir) {
    throw new Error(
      'GITHUB_FIXTURES_DIR is for tests and development; it is not allowed in production',
    );
  }
  if (!githubToken && !fixturesDir) {
    throw new Error('Set GITHUB_SERVER_TOKEN (or GITHUB_FIXTURES_DIR outside production)');
  }

  const oauth = {
    clientId: value(env, 'GITHUB_OAUTH_CLIENT_ID'),
    clientSecret: value(env, 'GITHUB_OAUTH_CLIENT_SECRET'),
  };
  if (!fixturesDir && (!oauth.clientId || !oauth.clientSecret)) {
    throw new Error(
      'Set GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET (the GitHub OAuth app)',
    );
  }

  let config: AppConfig;
  if (production) {
    const publicBaseUrl = withoutTrailingSlash(
      required(env, 'PUBLIC_BASE_URL', 'it is printed in every QR code and link'),
    );
    if (!publicBaseUrl.startsWith('https://')) {
      throw new Error('PUBLIC_BASE_URL must use https in production');
    }
    const sessionSecret = required(env, 'SESSION_SECRET', 'it signs the sessions');
    config = {
      production,
      githubToken,
      fixturesDir,
      redisUrl: required(env, 'REDIS_URL', 'the cache, limits and queues are shared'),
      databaseUrl: required(env, 'DATABASE_URL', 'published wraps must survive a restart'),
      publicBaseUrl,
      apiBaseUrl: withoutTrailingSlash(value(env, 'API_BASE_URL') ?? publicBaseUrl),
      filesDir: required(env, 'FILES_DIR', 'images and videos live on the shared volume'),
      sessionSecret,
      oauth: {
        clientId: required(env, 'GITHUB_OAUTH_CLIENT_ID', 'people sign in with GitHub'),
        clientSecret: required(env, 'GITHUB_OAUTH_CLIENT_SECRET', 'people sign in with GitHub'),
      },
      rateLimit: rateLimits(env),
      trustProxyHops: positiveInt(env, 'TRUST_PROXY_HOPS', 1),
      video: videoConfig(env, true),
    };
  } else {
    config = {
      production,
      githubToken,
      fixturesDir,
      redisUrl: value(env, 'REDIS_URL'),
      databaseUrl: value(env, 'DATABASE_URL'),
      publicBaseUrl: withoutTrailingSlash(value(env, 'PUBLIC_BASE_URL') ?? 'http://localhost:4200'),
      apiBaseUrl: withoutTrailingSlash(value(env, 'API_BASE_URL') ?? 'http://localhost:3000'),
      filesDir: value(env, 'FILES_DIR') ?? join(tmpdir(), 'github-wrapped-files'),
      sessionSecret: value(env, 'SESSION_SECRET') ?? devSecret(),
      oauth,
      rateLimit: rateLimits(env),
      trustProxyHops: positiveInt(env, 'TRUST_PROXY_HOPS', 1),
      video: videoConfig(env, false),
    };
  }

  if (config.sessionSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(`SESSION_SECRET must have at least ${MIN_SECRET_LENGTH} characters`);
  }
  return config;
}

function videoConfig(env: Env, production: boolean): VideoConfig {
  const mediaBaseUrl = value(env, 'PUBLIC_MEDIA_URL');
  if (production && mediaBaseUrl && !mediaBaseUrl.startsWith('https://')) {
    throw new Error('PUBLIC_MEDIA_URL must use https in production');
  }
  return {
    enabled: value(env, 'RENDER_VIDEO_ENABLED') === 'true',
    mediaBaseUrl: mediaBaseUrl ? withoutTrailingSlash(mediaBaseUrl) : null,
  };
}

function rateLimits(env: Env): AppConfig['rateLimit'] {
  return {
    preview: {
      max: positiveInt(env, 'RATE_LIMIT_PREVIEW_MAX', 20),
      windowSeconds: positiveInt(env, 'RATE_LIMIT_PREVIEW_WINDOW_SECONDS', 600),
    },
    publish: {
      max: positiveInt(env, 'RATE_LIMIT_PUBLISH_MAX', 10),
      windowSeconds: positiveInt(env, 'RATE_LIMIT_PUBLISH_WINDOW_SECONDS', 3600),
    },
  };
}
