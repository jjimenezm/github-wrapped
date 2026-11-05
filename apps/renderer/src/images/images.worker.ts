import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { IMAGES_QUEUE, type ImagesJob } from '@wrapped/shared';
import { Worker } from 'bullmq';
import { FONTS_DIR, RENDERER_CONFIG, type RendererConfig } from '../config';
import { fetchAvatar } from './avatars';
import { ImageFiles } from './image-files';
import { ImagesProcessor } from './images.processor';
import { createRasterizer } from './rasterizer';
import { RENDER_STORE, type RenderStore } from './render-store';

const logger = new Logger('ImagesWorker');

/**
 * Consumes the `images` queue. A failed attempt is retried by BullMQ (the api sets attempts and
 * backoff); after the last one the images are marked failed and the worker keeps going.
 */
export function startImagesWorker(
  processor: ImagesProcessor,
  options: { redisUrl: string; concurrency: number; queueName?: string },
): Worker<ImagesJob> {
  const worker = new Worker<ImagesJob>(
    options.queueName ?? IMAGES_QUEUE,
    (job) => processor.process(job.data),
    { connection: { url: options.redisUrl }, concurrency: options.concurrency },
  );
  worker.on('failed', (job, error) => {
    if (!job) return;
    const lastAttempt = job.attemptsMade >= (job.opts.attempts ?? 1);
    logger.warn(`images ${job.id} failed (attempt ${job.attemptsMade}): ${error.message}`);
    processor.fail(job.data, lastAttempt).catch((reason: unknown) => {
      logger.error(`could not mark images ${job.id} failed: ${String(reason)}`);
    });
  });
  worker.on('error', (error) => logger.error(`worker error: ${error.message}`));
  return worker;
}

@Injectable()
export class ImagesWorker implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker<ImagesJob>;

  /** The running BullMQ worker, for the health check; undefined until the module starts. */
  get running(): Worker<ImagesJob> | undefined {
    return this.worker;
  }

  constructor(
    @Inject(RENDERER_CONFIG) private readonly config: RendererConfig,
    @Inject(RENDER_STORE) private readonly store: RenderStore,
  ) {}

  onModuleInit(): void {
    const processor = new ImagesProcessor({
      store: this.store,
      files: new ImageFiles(this.config.filesDir),
      rasterize: createRasterizer(FONTS_DIR),
      avatars: (url) => fetchAvatar(url),
      publicBaseUrl: this.config.publicBaseUrl,
    });
    this.worker = startImagesWorker(processor, {
      redisUrl: this.config.redisUrl,
      concurrency: this.config.imagesConcurrency,
    });
    logger.log(`listening on "${IMAGES_QUEUE}" with concurrency ${this.config.imagesConcurrency}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
