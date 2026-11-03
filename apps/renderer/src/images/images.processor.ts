import { renderCard, type CardFormat } from '@wrapped/art';
import type { ImagesJob } from '@wrapped/shared';
import type { ImageFiles, ImageName } from './image-files';
import type { Rasterize } from './rasterizer';
import type { RenderStore } from './render-store';

export interface ImagesProcessorDeps {
  store: RenderStore;
  files: ImageFiles;
  rasterize: Rasterize;
  avatars: (avatarUrl: string) => Promise<string | null>;
  publicBaseUrl: string;
}

const OUTPUTS: Array<[CardFormat, ImageName]> = [
  ['portrait', 'card.png'],
  ['landscape', 'og.png'],
];

/**
 * One `images` job: the card (4:5) and the link preview (1200×630) of a wrap's images version,
 * drawn by packages/art and rasterized without a browser.
 */
export class ImagesProcessor {
  constructor(private readonly deps: ImagesProcessorDeps) {}

  async process({ wrapId, imagesVersion }: ImagesJob): Promise<'rendered' | 'skipped'> {
    const { store, files, rasterize, avatars, publicBaseUrl } = this.deps;
    const wrap = await store.findForRender(wrapId);
    // Deleted, gone, or a newer card change already queued: that newer job does the work.
    if (!wrap || wrap.status !== 'published' || !wrap.snapshot) return 'skipped';
    if (wrap.imagesVersion !== imagesVersion) return 'skipped';

    const avatarHref = await avatars(wrap.snapshot.avatarUrl);
    for (const [format, name] of OUTPUTS) {
      const svg = renderCard(wrap.snapshot, {
        style: wrap.cardStyle,
        locale: wrap.locale,
        format,
        publicBaseUrl,
        avatarHref,
      });
      await files.write(wrapId, imagesVersion, name, rasterize(svg));
    }
    await store.markImagesReady(wrapId, imagesVersion);
    await files.sweep(wrapId, imagesVersion);
    return 'rendered';
  }

  /** Called on every failed attempt; only the last one marks the images failed. */
  async fail({ wrapId, imagesVersion }: ImagesJob, lastAttempt: boolean): Promise<void> {
    if (lastAttempt) await this.deps.store.markImagesFailed(wrapId, imagesVersion);
  }
}
