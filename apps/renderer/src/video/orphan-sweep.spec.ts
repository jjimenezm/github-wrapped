import { renderableWrap } from '../../test/fixtures';
import { InMemoryRenderStore } from '../images/render-store';
import { sweepOrphanVideos } from './orphan-sweep';
import type { StoredVideo } from './video-storage';

const READY = '3f0c8a52-1b9e-4c7a-9d10-5e2f6b7a8c9d';
const RENDERING = '9b7f730f-33b2-47f0-863f-51a07d0b6bdd';
const DELETED = 'a1b2c3d4-0000-4000-8000-000000000001';
const UNKNOWN = 'a1b2c3d4-0000-4000-8000-000000000002';

function fakeStorage(videos: StoredVideo[]) {
  const stored = [...videos];
  return {
    stored,
    list: jest.fn(() => Promise.resolve([...stored])),
    remove: jest.fn((wrapId: string, version: number) => {
      const index = stored.findIndex((v) => v.wrapId === wrapId && v.version === version);
      if (index >= 0) stored.splice(index, 1);
      return Promise.resolve();
    }),
  };
}

describe('sweepOrphanVideos', () => {
  it('keeps each wrap’s ready video and its current one, and deletes everything else', async () => {
    const store = new InMemoryRenderStore([
      renderableWrap({ id: READY, dataVersion: 3, videoReadyVersion: 3, videoStatus: 'ready' }),
      // Regenerated: version 2 still plays while version 3 renders (it may be uploading now).
      renderableWrap({
        id: RENDERING,
        dataVersion: 3,
        videoReadyVersion: 2,
        videoStatus: 'rendering',
      }),
      renderableWrap({ id: DELETED, status: 'deleted', snapshot: null, videoReadyVersion: 1 }),
    ]);
    const storage = fakeStorage([
      { wrapId: READY, version: 1 },
      { wrapId: READY, version: 3 },
      { wrapId: RENDERING, version: 2 },
      { wrapId: RENDERING, version: 3 },
      { wrapId: DELETED, version: 1 },
      { wrapId: UNKNOWN, version: 4 },
    ]);

    expect(await sweepOrphanVideos(store, storage)).toBe(3);
    expect(storage.stored).toEqual([
      { wrapId: READY, version: 3 },
      { wrapId: RENDERING, version: 2 },
      { wrapId: RENDERING, version: 3 },
    ]);
  });

  it('reads no wraps when nothing is stored, and deletes nothing when all is in use', async () => {
    const store = new InMemoryRenderStore([renderableWrap({ id: READY, videoReadyVersion: 1 })]);
    const listPublished = jest.spyOn(store, 'listPublished');
    expect(await sweepOrphanVideos(store, fakeStorage([]))).toBe(0);
    expect(listPublished).not.toHaveBeenCalled();

    const storage = fakeStorage([{ wrapId: READY, version: 1 }]);
    expect(await sweepOrphanVideos(store, storage)).toBe(0);
    expect(storage.remove).not.toHaveBeenCalled();
  });
});
