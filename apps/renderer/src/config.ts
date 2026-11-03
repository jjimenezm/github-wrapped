import { join } from 'node:path';

export interface RendererConfig {
  redisUrl: string;
  databaseUrl: string;
  /** The volume shared with the api, which serves what the worker writes. */
  filesDir: string;
  /** Printed in every QR code and link on the cards. */
  publicBaseUrl: string;
  imagesConcurrency: number;
}

export const RENDERER_CONFIG = Symbol('RENDERER_CONFIG');

/** Geist and Geist Mono (SIL OFL), shipped with the worker so every PNG looks the same. */
export const FONTS_DIR = join(__dirname, '..', 'assets', 'fonts');

type Env = Record<string, string | undefined>;

const required = (env: Env, name: string) => {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required by the renderer`);
  return value;
};

/** The worker can do nothing without its queue, database and volume, so it refuses to start. */
export function loadRendererConfig(env: Env): RendererConfig {
  const concurrency = env.RENDER_IMAGES_CONCURRENCY?.trim() || '1';
  const imagesConcurrency = Number(concurrency);
  if (!Number.isInteger(imagesConcurrency) || imagesConcurrency <= 0) {
    throw new Error(`RENDER_IMAGES_CONCURRENCY must be a positive integer, got "${concurrency}"`);
  }
  return {
    redisUrl: required(env, 'REDIS_URL'),
    databaseUrl: required(env, 'DATABASE_URL'),
    filesDir: required(env, 'FILES_DIR'),
    publicBaseUrl: required(env, 'PUBLIC_BASE_URL').replace(/\/+$/, ''),
    imagesConcurrency,
  };
}
