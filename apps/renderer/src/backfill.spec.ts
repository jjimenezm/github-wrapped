import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderableWrap } from '../test/fixtures';
import { backfillImages } from './backfill';
import { ImageFiles } from './images/image-files';
import { InMemoryRenderStore } from './images/render-store';

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
