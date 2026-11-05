import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { FONTS_DIR, loadRendererConfig } from './config';

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
