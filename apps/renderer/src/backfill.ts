import type { ImageFiles } from './images/image-files';
import type { RenderStore } from './images/render-store';

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
