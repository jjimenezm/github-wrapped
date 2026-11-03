import { publicWrapUrl } from '@wrapped/shared';
import jsQR from 'jsqr';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { BASE_URL, renderableWrap, WRAP_ID } from '../../test/fixtures';
import { FONTS_DIR } from '../config';
import { ImageFiles } from './image-files';
import { ImagesProcessor } from './images.processor';
import { createRasterizer } from './rasterizer';
import { InMemoryRenderStore, type RenderableWrap } from './render-store';

const rasterize = createRasterizer(FONTS_DIR);

function setup(wrap: RenderableWrap | null = renderableWrap()) {
  const store = new InMemoryRenderStore(wrap ? [wrap] : []);
  return mkdtemp(join(tmpdir(), 'renderer-')).then((root) => {
    const files = new ImageFiles(root);
    const avatars = jest.fn(() => Promise.resolve<string | null>(null));
    const processor = new ImagesProcessor({
      store,
      files,
      rasterize,
      avatars,
      publicBaseUrl: BASE_URL,
    });
    return { store, files, root, avatars, processor };
  });
}

const png = async (path: string) => PNG.sync.read(await readFile(path));

describe('ImagesProcessor', () => {
  it('renders card.png (1080×1350) and og.png (1200×630) and marks the version ready', async () => {
    const t = await setup();
    expect(await t.processor.process({ wrapId: WRAP_ID, imagesVersion: 1 })).toBe('rendered');
    const card = await png(join(t.root, WRAP_ID, 'img', '1', 'card.png'));
    const og = await png(join(t.root, WRAP_ID, 'img', '1', 'og.png'));
    expect([card.width, card.height]).toEqual([1080, 1350]);
    expect([og.width, og.height]).toEqual([1200, 630]);
    expect(t.store.get(WRAP_ID)).toMatchObject({ imagesReadyVersion: 1, imagesStatus: 'ready' });
  });

  it('prints a QR that opens the public page', async () => {
    const t = await setup();
    await t.processor.process({ wrapId: WRAP_ID, imagesVersion: 1 });
    const card = await png(join(t.root, WRAP_ID, 'img', '1', 'card.png'));
    const qr = jsQR(new Uint8ClampedArray(card.data), card.width, card.height, {
      inversionAttempts: 'dontInvert',
    });
    expect(qr?.data).toBe(publicWrapUrl(BASE_URL, 'ana-dev', 2026));
  });

  it('renders in the wrap’s language', async () => {
    const es = await setup(renderableWrap({ locale: 'es' }));
    const en = await setup(renderableWrap({ locale: 'en' }));
    await es.processor.process({ wrapId: WRAP_ID, imagesVersion: 1 });
    await en.processor.process({ wrapId: WRAP_ID, imagesVersion: 1 });
    const path = (root: string) => join(root, WRAP_ID, 'img', '1', 'card.png');
    expect(await readFile(path(es.root))).not.toEqual(await readFile(path(en.root)));
  });

  it('uses the avatar when GitHub gives one, from GitHub’s avatar host only', async () => {
    const t = await setup();
    await t.processor.process({ wrapId: WRAP_ID, imagesVersion: 1 });
    expect(t.avatars).toHaveBeenCalledWith('https://avatars.githubusercontent.com/u/4242');
  });

  it('keeps the video when a card change sweeps the older images', async () => {
    const t = await setup(
      renderableWrap({ imagesVersion: 2, imagesReadyVersion: 1, imagesStatus: 'queued' }),
    );
    await mkdir(join(t.root, WRAP_ID, 'img', '1'), { recursive: true });
    await writeFile(join(t.root, WRAP_ID, 'img', '1', 'card.png'), 'old');
    await mkdir(join(t.root, WRAP_ID, 'video'), { recursive: true });
    await writeFile(join(t.root, WRAP_ID, 'video', '1.mp4'), 'mp4');
    await t.processor.process({ wrapId: WRAP_ID, imagesVersion: 2 });
    expect(await readdir(join(t.root, WRAP_ID, 'img'))).toEqual(['2']);
    expect(await readdir(join(t.root, WRAP_ID, 'video'))).toEqual(['1.mp4']);
  });

  it('writes nothing for a deleted wrap', async () => {
    const t = await setup(renderableWrap({ status: 'deleted', snapshot: null }));
    expect(await t.processor.process({ wrapId: WRAP_ID, imagesVersion: 1 })).toBe('skipped');
    expect(await readdir(t.root)).toEqual([]);
  });

  it('writes nothing for a wrap that no longer exists', async () => {
    const t = await setup(null);
    expect(await t.processor.process({ wrapId: WRAP_ID, imagesVersion: 1 })).toBe('skipped');
    expect(await readdir(t.root)).toEqual([]);
  });

  it('skips a version that a newer card change already replaced', async () => {
    const t = await setup(renderableWrap({ imagesVersion: 3 }));
    expect(await t.processor.process({ wrapId: WRAP_ID, imagesVersion: 2 })).toBe('skipped');
    expect(await readdir(t.root)).toEqual([]);
  });

  it('lets a failed write throw for a retry, and marks the images failed after the last one', async () => {
    const t = await setup();
    jest.spyOn(t.files, 'write').mockRejectedValue(new Error('ENOSPC: no space left on device'));
    await expect(t.processor.process({ wrapId: WRAP_ID, imagesVersion: 1 })).rejects.toThrow(
      /ENOSPC/,
    );
    await t.processor.fail({ wrapId: WRAP_ID, imagesVersion: 1 }, false);
    expect(t.store.get(WRAP_ID)?.imagesStatus).toBe('queued');
    await t.processor.fail({ wrapId: WRAP_ID, imagesVersion: 1 }, true);
    expect(t.store.get(WRAP_ID)?.imagesStatus).toBe('failed');
  });
});
