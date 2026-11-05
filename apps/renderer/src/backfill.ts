import type { ImageFiles } from './images/image-files';
import type { RenderStore } from './images/render-store';
import type { VideoStorage } from './video/video-storage';

/**
 * After losing the volume (or restoring a backup): queues the images of every published wrap
 * whose current version has no files. Returns how many were queued.
 */
export async function backfillImages(
  store: RenderStore,
  files: ImageFiles,
  queue: { enqueueImages(wrapId: string, imagesVersion: number): Promise<void> },
): Promise<number> {
  let queued = 0;
  for (const wrap of await store.listPublished()) {
    if (await files.has(wrap.id, wrap.imagesVersion)) continue;
    await queue.enqueueImages(wrap.id, wrap.imagesVersion);
    queued++;
  }
  return queued;
}

/**
 * When videos are turned on, and after a restore: queues the video of every published wrap whose
 * current data has none, frozen years included (freezing stops new data, not rendering what was
 * published). The worker renders them one at a time. Running it again queues nothing new.
 */
export async function backfillVideos(
  store: RenderStore,
  storage: VideoStorage,
  queue: {
    /** False when that video is already waiting or rendering. */
    enqueueVideo(wrapId: string, dataVersion: number): Promise<boolean>;
  },
): Promise<number> {
  let queued = 0;
  for (const wrap of await store.listPublished()) {
    if (await storage.has(wrap.id, wrap.dataVersion)) continue;
    if (!(await queue.enqueueVideo(wrap.id, wrap.dataVersion))) continue;
    await store.markVideoQueued(wrap.id, wrap.dataVersion);
    queued++;
  }
  return queued;
}
