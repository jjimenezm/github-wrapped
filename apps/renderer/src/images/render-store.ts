import type { CardStyle, ImagesStatus, Locale, VideoStatus, WrapSnapshot } from '@wrapped/shared';

/** What the worker reads from a wrap to draw its images and its video. */
export interface RenderableWrap {
  id: string;
  login: string;
  year: number;
  locale: Locale;
  cardStyle: CardStyle;
  snapshot: WrapSnapshot | null;
  status: 'published' | 'deleted';
  imagesVersion: number;
  imagesReadyVersion: number | null;
  imagesStatus: ImagesStatus;
  /** The data the video shows: a new one per publication or regeneration. */
  dataVersion: number;
  videoReadyVersion: number | null;
  videoStatus: VideoStatus;
}

export type PublishedWrap = Pick<
  RenderableWrap,
  | 'id'
  | 'imagesVersion'
  | 'imagesReadyVersion'
  | 'dataVersion'
  | 'videoReadyVersion'
  | 'videoStatus'
>;

export interface RenderStore {
  findForRender(wrapId: string): Promise<RenderableWrap | null>;
  /**
   * The version's files exist: it becomes the ready version if it is newer, and the status turns
   * ready only if no newer version was asked for meanwhile.
   */
  markImagesReady(wrapId: string, imagesVersion: number): Promise<void>;
  /** Retries ran out: failed, unless a newer version was asked for meanwhile. */
  markImagesFailed(wrapId: string, imagesVersion: number): Promise<void>;
  /** The worker took the current data's video. */
  markVideoRendering(wrapId: string, dataVersion: number): Promise<void>;
  /**
   * The version's MP4 is in place: it becomes the ready version if it is newer, and the status
   * turns ready if it is the current data. Returns the ready version, or null when the wrap is no
   * longer published (deleted while rendering), so the caller takes the file back.
   */
  markVideoReady(wrapId: string, dataVersion: number): Promise<number | null>;
  markVideoFailed(wrapId: string, dataVersion: number): Promise<void>;
  /** A video asked for by the backfill (wraps published before videos, or after a restore). */
  markVideoQueued(wrapId: string, dataVersion: number): Promise<void>;
  listPublished(): Promise<PublishedWrap[]>;
}

export const RENDER_STORE = Symbol('RENDER_STORE');

/** For tests: the same rules as the Postgres store. */
export class InMemoryRenderStore implements RenderStore {
  private readonly wraps = new Map<string, RenderableWrap>();

  constructor(wraps: RenderableWrap[] = []) {
    for (const wrap of wraps) this.wraps.set(wrap.id, structuredClone(wrap));
  }

  get(wrapId: string): RenderableWrap | undefined {
    return this.wraps.get(wrapId);
  }

  findForRender(wrapId: string): Promise<RenderableWrap | null> {
    const wrap = this.wraps.get(wrapId);
    return Promise.resolve(wrap ? structuredClone(wrap) : null);
  }

  markImagesReady(wrapId: string, imagesVersion: number): Promise<void> {
    const wrap = this.wraps.get(wrapId);
    if (wrap?.status === 'published') {
      wrap.imagesReadyVersion = Math.max(wrap.imagesReadyVersion ?? 0, imagesVersion);
      if (wrap.imagesVersion === imagesVersion) wrap.imagesStatus = 'ready';
    }
    return Promise.resolve();
  }

  markImagesFailed(wrapId: string, imagesVersion: number): Promise<void> {
    const wrap = this.wraps.get(wrapId);
    if (wrap?.status === 'published' && wrap.imagesVersion === imagesVersion) {
      wrap.imagesStatus = 'failed';
    }
    return Promise.resolve();
  }

  markVideoRendering(wrapId: string, dataVersion: number): Promise<void> {
    this.setCurrentVideo(wrapId, dataVersion, 'rendering');
    return Promise.resolve();
  }

  markVideoReady(wrapId: string, dataVersion: number): Promise<number | null> {
    const wrap = this.wraps.get(wrapId);
    if (wrap?.status !== 'published') return Promise.resolve(null);
    wrap.videoReadyVersion = Math.max(wrap.videoReadyVersion ?? 0, dataVersion);
    if (wrap.dataVersion === dataVersion) wrap.videoStatus = 'ready';
    return Promise.resolve(wrap.videoReadyVersion);
  }

  markVideoFailed(wrapId: string, dataVersion: number): Promise<void> {
    this.setCurrentVideo(wrapId, dataVersion, 'failed');
    return Promise.resolve();
  }

  markVideoQueued(wrapId: string, dataVersion: number): Promise<void> {
    this.setCurrentVideo(wrapId, dataVersion, 'queued');
    return Promise.resolve();
  }

  private setCurrentVideo(wrapId: string, dataVersion: number, status: VideoStatus) {
    const wrap = this.wraps.get(wrapId);
    if (wrap?.status === 'published' && wrap.dataVersion === dataVersion) {
      wrap.videoStatus = status;
    }
  }

  listPublished(): Promise<PublishedWrap[]> {
    return Promise.resolve(
      [...this.wraps.values()]
        .filter((w) => w.status === 'published')
        .map(
          ({
            id,
            imagesVersion,
            imagesReadyVersion,
            dataVersion,
            videoReadyVersion,
            videoStatus,
          }) => ({
            id,
            imagesVersion,
            imagesReadyVersion,
            dataVersion,
            videoReadyVersion,
            videoStatus,
          }),
        ),
    );
  }
}
