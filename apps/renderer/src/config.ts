import { join } from 'node:path';
import type { MediaBucketConfig } from './video/r2-video-storage';

export interface RendererConfig {
  redisUrl: string;
  databaseUrl: string;
  /** The volume shared with the api, which serves what the worker writes. */
  filesDir: string;
  /** Printed in every QR code and link on the cards. */
  publicBaseUrl: string;
  imagesConcurrency: number;
  /**
   * The image sets this: FILES_DIR must be a volume mounted into the container, or the PNGs would
   * land in the container's own layer, where the api never sees them.
   */
  requireFilesVolume: boolean;
  video: VideoRenderConfig;
}

/** How the low-memory profile of HyperFrames is used: on retries only (default), always or never. */
export const LOW_MEMORY_MODES = ['retry', 'always', 'never'] as const;
export type LowMemoryMode = (typeof LOW_MEMORY_MODES)[number];

export interface VideoRenderConfig {
  /** RENDER_VIDEO_ENABLED: the `video` worker runs, and the api queues videos (same switch). */
  enabled: boolean;
  /** RENDER_VIDEO_CONCURRENCY: one render takes most of the server's CPU, so 1. */
  concurrency: number;
  /** RENDER_VIDEO_TIMEOUT_MS: a render that takes longer is stopped and fails for good. */
  timeoutMs: number;
  /**
   * RENDER_VIDEO_LOW_MEMORY. BeginFrame capture (`--no-low-memory-mode`) is ~11 % faster on the
   * server; a failed render retries with HyperFrames' low-memory profile (screenshot capture).
   */
  lowMemory: LowMemoryMode;
  /** RENDER_VIDEO_COMPOSITION: the HyperFrames project rendered, copied once per render. */
  composition: string;
  /**
   * Where renders work (the composition copy, its variables, the MP4 being written): on the files
   * volume, so the finished MP4 is moved into place, never copied half-way.
   */
  workDir: string;
  /** HYPERFRAMES_BIN: the CLI, installed globally in the image at a pinned version. */
  hyperframesBin: string;
  /**
   * R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY: the media bucket the videos
   * go to (the api links them from PUBLIC_MEDIA_URL). Unset, they stay on the files volume.
   */
  bucket: MediaBucketConfig | null;
}

export const RENDERER_CONFIG = Symbol('RENDERER_CONFIG');

/** Geist and Geist Mono (SIL OFL), shipped with the worker so every PNG looks the same. */
export const FONTS_DIR = join(__dirname, '..', 'assets', 'fonts');

/** The HyperFrames projects of the video, shipped with the worker. */
export const COMPOSITIONS_DIR = join(__dirname, '..', 'compositions');

/** The 30-second wrap video, rendered unless RENDER_VIDEO_COMPOSITION says otherwise. */
export const DEFAULT_COMPOSITION = join(COMPOSITIONS_DIR, 'wrap');

type Env = Record<string, string | undefined>;

const required = (env: Env, name: string) => {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required by the renderer`);
  return value;
};

function positiveInt(env: Env, name: string, fallback: number): number {
  const raw = env[name]?.trim() || String(fallback);
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  }
  return parsed;
}

/** The worker can do nothing without its queue, database and volume, so it refuses to start. */
export function loadRendererConfig(env: Env): RendererConfig {
  const filesDir = required(env, 'FILES_DIR');
  const lowMemory = env.RENDER_VIDEO_LOW_MEMORY?.trim() || 'retry';
  if (!LOW_MEMORY_MODES.includes(lowMemory as LowMemoryMode)) {
    throw new Error(
      `RENDER_VIDEO_LOW_MEMORY must be one of ${LOW_MEMORY_MODES.join(', ')}, got "${lowMemory}"`,
    );
  }
  return {
    redisUrl: required(env, 'REDIS_URL'),
    databaseUrl: required(env, 'DATABASE_URL'),
    filesDir,
    publicBaseUrl: required(env, 'PUBLIC_BASE_URL').replace(/\/+$/, ''),
    imagesConcurrency: positiveInt(env, 'RENDER_IMAGES_CONCURRENCY', 1),
    requireFilesVolume: env.REQUIRE_FILES_VOLUME?.trim() === 'true',
    video: {
      enabled: env.RENDER_VIDEO_ENABLED?.trim() === 'true',
      concurrency: positiveInt(env, 'RENDER_VIDEO_CONCURRENCY', 1),
      timeoutMs: positiveInt(env, 'RENDER_VIDEO_TIMEOUT_MS', 600_000),
      lowMemory: lowMemory as LowMemoryMode,
      composition: env.RENDER_VIDEO_COMPOSITION?.trim() || DEFAULT_COMPOSITION,
      // A dot folder: the api never serves dotfiles, and wrap folders are UUIDs.
      workDir: join(filesDir, '.renders'),
      hyperframesBin: env.HYPERFRAMES_BIN?.trim() || 'hyperframes',
      bucket: mediaBucket(env),
    },
  };
}

const BUCKET_VARIABLES = ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'];

/** All four or none: half a bucket would upload videos nobody can find, or fail at the first one. */
function mediaBucket(env: Env): MediaBucketConfig | null {
  const set = BUCKET_VARIABLES.filter((name) => env[name]?.trim());
  if (set.length === 0) return null;
  if (set.length < BUCKET_VARIABLES.length) {
    const missing = BUCKET_VARIABLES.filter((name) => !set.includes(name));
    throw new Error(
      `The media bucket needs ${missing.join(', ')} too (or none of the R2_* variables)`,
    );
  }
  const bucket = required(env, 'R2_BUCKET');
  return {
    endpoint: accountEndpoint(required(env, 'R2_ENDPOINT'), bucket),
    bucket,
    accessKeyId: required(env, 'R2_ACCESS_KEY_ID'),
    secretAccessKey: required(env, 'R2_SECRET_ACCESS_KEY'),
  };
}

/**
 * The account's S3 endpoint, `https://<account-id>.r2.cloudflarestorage.com`. R2's dashboard shows
 * it with the bucket appended, so that form is accepted too; any other path would put every key
 * under the wrong folder of the bucket.
 */
function accountEndpoint(raw: string, bucket: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`R2_ENDPOINT is not a URL: "${raw}"`);
  }
  if (url.protocol !== 'https:') throw new Error('R2_ENDPOINT must use https');
  const path = url.pathname.replace(/\/+$/, '');
  if (path && path !== `/${bucket}`) {
    throw new Error(
      `R2_ENDPOINT must be the account endpoint (https://<account-id>.r2.cloudflarestorage.com), without a path; got "${raw}"`,
    );
  }
  return url.origin;
}
