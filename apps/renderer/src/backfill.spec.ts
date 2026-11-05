import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderableWrap } from '../test/fixtures';
import { backfillImages, backfillVideos } from './backfill';
import { ImageFiles } from './images/image-files';
import { InMemoryRenderStore } from './images/render-store';
import { VolumeVideoStorage } from './video/video-storage';

const ID_A = '3f0c8a52-1b9e-4c7a-9d10-5e2f6b7a8c9d';
const ID_B = '9b7f730f-33b2-47f0-863f-51a07d0b6bdd';
const ID_C = 'a1b2c3d4-0000-4000-8000-000000000001';

describe('backfillImages', () => {
  it('queues the images of published wraps whose files are missing, and nothing else', async () => {
    const files = new ImageFiles(await mkdtemp(join(tmpdir(), 'backfill-')));
    await files.write(ID_B, 2, 'card.png', Buffer.from('x'));
    const store = new InMemoryRenderStore([
      renderableWrap({ id: ID_A, imagesVersion: 1, imagesReadyVersion: 1 }),
      renderableWrap({ id: ID_B, imagesVersion: 2, imagesReadyVersion: 2 }),
      renderableWrap({ id: ID_C, status: 'deleted', snapshot: null }),
    ]);
    const queued: Array<[string, number]> = [];
    const queue = {
      enqueueImages: (id: string, v: number) => Promise.resolve(void queued.push([id, v])),
    };

    expect(await backfillImages(store, files, queue)).toBe(1);
    expect(queued).toEqual([[ID_A, 1]]);
  });
});

describe('backfillVideos', () => {
  /** The queue's rule: one job per id, so a video already waiting is not queued twice. */
  function fakeQueue() {
    const ids = new Set<string>();
    return {
      ids,
      enqueueVideo: (id: string, v: number) => {
        const key = `video-${id}-${v}`;
        if (ids.has(key)) return Promise.resolve(false);
        ids.add(key);
        return Promise.resolve(true);
      },
    };
  }

  it('queues the videos of wraps published before videos, frozen years included, once', async () => {
    const root = await mkdtemp(join(tmpdir(), 'backfill-'));
    const storage = new VolumeVideoStorage(root);
    const store = new InMemoryRenderStore([
      renderableWrap({ id: ID_A, videoStatus: 'none' }),
      renderableWrap({ id: ID_B, year: 2025, dataVersion: 2, videoStatus: 'none' }),
      renderableWrap({ id: ID_C, status: 'deleted', snapshot: null, videoStatus: 'none' }),
    ]);
    const queue = fakeQueue();

    expect(await backfillVideos(store, storage, queue)).toBe(2);
    expect([...queue.ids]).toEqual([`video-${ID_A}-1`, `video-${ID_B}-2`]);
    expect(store.get(ID_A)?.videoStatus).toBe('queued');
    expect(store.get(ID_B)?.videoStatus).toBe('queued');

    expect(await backfillVideos(store, storage, queue)).toBe(0);
    expect(queue.ids.size).toBe(2);
  });

  it('skips wraps whose current video is already in the files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'backfill-'));
    const storage = new VolumeVideoStorage(root);
    const source = join(root, 'render.mp4');
    await writeFile(source, 'mp4');
    await storage.publish(ID_A, 1, source);
    const store = new InMemoryRenderStore([
      renderableWrap({ id: ID_A, videoReadyVersion: 1, videoStatus: 'ready' }),
    ]);
    expect(await backfillVideos(store, storage, fakeQueue())).toBe(0);
  });
});
