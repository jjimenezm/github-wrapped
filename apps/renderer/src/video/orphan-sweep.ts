import type { RenderStore } from '../images/render-store';
import type { VideoStorage } from './video-storage';

/**
 * Deletes every stored video no published wrap uses: those of deleted (or unknown) wraps, and old
 * versions a sweep missed. Kept: each wrap's ready video and the one of its current data, which
 * may be uploading right now. The storage is listed before the wraps are read, so a video stored
 * meanwhile is never judged against data older than itself. Returns how many it deleted.
 */
export async function sweepOrphanVideos(
  store: Pick<RenderStore, 'listPublished'>,
  storage: Pick<VideoStorage, 'list' | 'remove'>,
): Promise<number> {
  const stored = await storage.list();
  if (stored.length === 0) return 0;
  const published = new Map((await store.listPublished()).map((wrap) => [wrap.id, wrap]));
  const orphans = stored.filter(({ wrapId, version }) => {
    const wrap = published.get(wrapId);
    return !wrap || (version !== wrap.videoReadyVersion && version !== wrap.dataVersion);
  });
  for (const { wrapId, version } of orphans) await storage.remove(wrapId, version);
  return orphans.length;
}
