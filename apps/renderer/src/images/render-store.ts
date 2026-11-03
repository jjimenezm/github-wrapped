import type { CardStyle, ImagesStatus, Locale, WrapSnapshot } from '@wrapped/shared';

/** What the worker reads from a wrap to draw its images. */
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
}

export interface RenderStore {
  findForRender(wrapId: string): Promise<RenderableWrap | null>;
  /**
   * The version's files exist: it becomes the ready version if it is newer, and the status turns
   * ready only if no newer version was asked for meanwhile.
   */
  markImagesReady(wrapId: string, imagesVersion: number): Promise<void>;
  /** Retries ran out: failed, unless a newer version was asked for meanwhile. */
  markImagesFailed(wrapId: string, imagesVersion: number): Promise<void>;
  listPublished(): Promise<
    Array<Pick<RenderableWrap, 'id' | 'imagesVersion' | 'imagesReadyVersion'>>
  >;
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

  listPublished() {
    return Promise.resolve(
      [...this.wraps.values()]
        .filter((w) => w.status === 'published')
        .map(({ id, imagesVersion, imagesReadyVersion }) => ({
          id,
          imagesVersion,
          imagesReadyVersion,
        })),
    );
  }
}
