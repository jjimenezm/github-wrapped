import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_COMPOSITION, FONTS_DIR, loadRendererConfig } from './config';

const ENV = {
  REDIS_URL: 'redis://r:6379',
  DATABASE_URL: 'postgresql://u:p@db:5432/wrapped',
  FILES_DIR: '/data/files',
  PUBLIC_BASE_URL: 'https://wrapped.jjimenezm.dev/',
};

describe('loadRendererConfig', () => {
  it('reads what the worker needs, with one image render at a time by default', () => {
    expect(loadRendererConfig(ENV)).toEqual({
      redisUrl: 'redis://r:6379',
      databaseUrl: 'postgresql://u:p@db:5432/wrapped',
      filesDir: '/data/files',
      publicBaseUrl: 'https://wrapped.jjimenezm.dev',
      imagesConcurrency: 1,
      requireFilesVolume: false,
      video: {
        enabled: false,
        concurrency: 1,
        timeoutMs: 600_000,
        lowMemory: 'retry',
        composition: DEFAULT_COMPOSITION,
        workDir: '/data/files/.renders',
        hyperframesBin: 'hyperframes',
        bucket: null,
      },
    });
    expect(loadRendererConfig({ ...ENV, RENDER_IMAGES_CONCURRENCY: '3' }).imagesConcurrency).toBe(
      3,
    );
  });

  it.each(['REDIS_URL', 'DATABASE_URL', 'FILES_DIR', 'PUBLIC_BASE_URL'])('needs %s', (name) => {
    expect(() => loadRendererConfig({ ...ENV, [name]: undefined })).toThrow(new RegExp(name));
  });

  it('can insist that FILES_DIR is a mounted volume (set in the image)', () => {
    expect(loadRendererConfig({ ...ENV, REQUIRE_FILES_VOLUME: 'true' }).requireFilesVolume).toBe(
      true,
    );
    expect(loadRendererConfig({ ...ENV, REQUIRE_FILES_VOLUME: 'false' }).requireFilesVolume).toBe(
      false,
    );
  });

  it('rejects a concurrency that is not a positive integer', () => {
    expect(() => loadRendererConfig({ ...ENV, RENDER_IMAGES_CONCURRENCY: '0' })).toThrow(
      /RENDER_IMAGES_CONCURRENCY/,
    );
  });

  it('renders videos only when RENDER_VIDEO_ENABLED is "true", with the measured settings', () => {
    const video = loadRendererConfig({
      ...ENV,
      RENDER_VIDEO_ENABLED: 'true',
      RENDER_VIDEO_CONCURRENCY: '2',
      RENDER_VIDEO_TIMEOUT_MS: '900000',
      RENDER_VIDEO_LOW_MEMORY: 'always',
      RENDER_VIDEO_COMPOSITION: '/app/compositions/wrap',
    }).video;
    expect(video).toMatchObject({
      enabled: true,
      concurrency: 2,
      timeoutMs: 900_000,
      lowMemory: 'always',
      composition: '/app/compositions/wrap',
    });
    expect(loadRendererConfig({ ...ENV, RENDER_VIDEO_ENABLED: 'yes' }).video.enabled).toBe(false);
  });

  it.each([
    ['RENDER_VIDEO_CONCURRENCY', '0'],
    ['RENDER_VIDEO_TIMEOUT_MS', '10m'],
    ['RENDER_VIDEO_LOW_MEMORY', 'sometimes'],
  ])('rejects %s=%s', (name, value) => {
    expect(() => loadRendererConfig({ ...ENV, [name]: value })).toThrow(new RegExp(name));
  });

  it('sends the videos to the media bucket when all four R2 variables are set', () => {
    const bucket = {
      R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com/',
      R2_BUCKET: 'media',
      R2_ACCESS_KEY_ID: 'key-id',
      R2_SECRET_ACCESS_KEY: 'key-secret',
    };
    expect(loadRendererConfig({ ...ENV, ...bucket }).video.bucket).toEqual({
      endpoint: 'https://account.r2.cloudflarestorage.com',
      bucket: 'media',
      accessKeyId: 'key-id',
      secretAccessKey: 'key-secret',
    });
    expect(() => loadRendererConfig({ ...ENV, ...bucket, R2_SECRET_ACCESS_KEY: '' })).toThrow(
      /R2_SECRET_ACCESS_KEY/,
    );
    expect(() =>
      loadRendererConfig({ ...ENV, ...bucket, R2_ENDPOINT: 'http://localhost:9000' }),
    ).toThrow(/https/);
  });

  it('takes the endpoint as R2’s dashboard shows it, with the bucket appended', () => {
    const bucket = {
      R2_BUCKET: 'media',
      R2_ACCESS_KEY_ID: 'key-id',
      R2_SECRET_ACCESS_KEY: 'key-secret',
    };
    const endpoint = (value: string) =>
      loadRendererConfig({ ...ENV, ...bucket, R2_ENDPOINT: value }).video.bucket?.endpoint;
    expect(endpoint('https://account.r2.cloudflarestorage.com/media')).toBe(
      'https://account.r2.cloudflarestorage.com',
    );
    expect(endpoint('https://account.r2.cloudflarestorage.com/media/')).toBe(
      'https://account.r2.cloudflarestorage.com',
    );
    // Any other path would file every video under the wrong folder of the bucket.
    expect(() => endpoint('https://account.r2.cloudflarestorage.com/other')).toThrow(
      /without a path/,
    );
    expect(() => endpoint('not a url')).toThrow(/not a URL/);
  });

  it('renders the wrap composition shipped with the worker', () => {
    expect(existsSync(join(DEFAULT_COMPOSITION, 'index.html'))).toBe(true);
    expect(existsSync(join(DEFAULT_COMPOSITION, 'variables.schema.json'))).toBe(true);
  });

  it('ships the Geist fonts the cards are drawn with', () => {
    for (const font of [
      'Geist-Regular.ttf',
      'Geist-Medium.ttf',
      'Geist-SemiBold.ttf',
      'GeistMono-Regular.ttf',
    ]) {
      expect(existsSync(join(FONTS_DIR, font))).toBe(true);
    }
  });
});
