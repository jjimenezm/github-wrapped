import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  VIDEO_ORPHAN_SWEEP,
  VIDEO_PURGE_QUEUE,
  VIDEO_QUEUE,
  type VideoJob,
  type VideoPurgeJob,
} from '@wrapped/shared';
import { Queue, UnrecoverableError, Worker, type Job } from 'bullmq';
import { RENDERER_CONFIG, type RendererConfig } from '../config';
import { fetchAvatar, VIDEO_AVATAR_PX } from '../images/avatars';
import { RENDER_STORE, type RenderStore } from '../images/render-store';
import { createHyperframesRenderer, RenderTimeoutError } from './hyperframes';
import { sweepOrphanVideos } from './orphan-sweep';
import { VideoProcessor } from './video.processor';
import { VIDEO_STORAGE, type VideoStorage } from './video-storage';

const logger = new Logger('VideoWorker');

/** The last attempt failed, or the render can't succeed by trying again (it timed out). */
export const isFinalFailure = (job: Job, error: Error) =>
  error.name === 'UnrecoverableError' || job.attemptsMade >= (job.opts.attempts ?? 1);

/**
 * Consumes the `video` queue. A timeout fails the job for good (the same render would time out
 * again); any other error gets the automatic retry, with the low-memory profile. Once the job
 * failed for good the video is marked failed and the owner can retry it.
 */
export function startVideoWorker(
  processor: VideoProcessor,
  options: { redisUrl: string; concurrency: number; queueName?: string },
): Worker<VideoJob> {
  const worker = new Worker<VideoJob>(
    options.queueName ?? VIDEO_QUEUE,
    async (job) => {
      const started = Date.now();
      try {
        const outcome = await processor.process(job.data, { retry: job.attemptsMade > 0 });
        logger.log(`video ${job.id} ${outcome} in ${Math.round((Date.now() - started) / 1000)} s`);
        return outcome;
      } catch (error) {
        if (error instanceof RenderTimeoutError) throw new UnrecoverableError(error.message);
        throw error;
      }
    },
    { connection: { url: options.redisUrl }, concurrency: options.concurrency },
  );
  worker.on('failed', (job, error) => {
    if (!job) return;
    logger.warn(`video ${job.id} failed (attempt ${job.attemptsMade}): ${error.message}`);
    if (!isFinalFailure(job, error)) return;
    processor.fail(job.data).catch((reason: unknown) => {
      logger.error(`could not mark video ${job.id} failed: ${String(reason)}`);
    });
  });
  worker.on('error', (error) => logger.error(`worker error: ${error.message}`));
  return worker;
}

/**
 * Empties the media bucket of deleted wraps, and once a day of every video no wrap uses. Its own
 * queue and worker, so a deletion never waits behind a render; BullMQ retries while R2 is out,
 * and keeps the job if it never answers.
 */
export function startPurgeWorker(
  cleanup: { purge(wrapId: string): Promise<void>; sweep(): Promise<number> },
  options: { redisUrl: string; queueName?: string },
): Worker<VideoPurgeJob> {
  const worker = new Worker<VideoPurgeJob>(
    options.queueName ?? VIDEO_PURGE_QUEUE,
    async ({ data }) => {
      if (data.wrapId !== null) return cleanup.purge(data.wrapId);
      const deleted = await cleanup.sweep();
      logger.log(`daily sweep: deleted ${deleted} video(s) no wrap uses`);
    },
    { connection: { url: options.redisUrl } },
  );
  worker.on('failed', (job, error) => {
    const what = job?.data.wrapId ? `purge of ${job.data.wrapId}` : 'daily sweep';
    logger.warn(`${what} failed: ${error.message}`);
  });
  worker.on('error', (error) => logger.error(`purge worker error: ${error.message}`));
  return worker;
}

/** The daily sweep, at the time VIDEO_ORPHAN_SWEEP sets (UTC). Upserting it again is harmless. */
export function scheduleOrphanSweep(queue: Queue<VideoPurgeJob>) {
  return queue.upsertJobScheduler(
    VIDEO_ORPHAN_SWEEP.id,
    { pattern: VIDEO_ORPHAN_SWEEP.pattern, tz: 'UTC' },
    {
      name: 'sweep',
      data: { wrapId: null },
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: 30,
        removeOnFail: 30,
      },
    },
  );
}

/**
 * The video worker starts only with RENDER_VIDEO_ENABLED (until then the api queues no videos
 * either). The purge worker runs whenever videos live in the media bucket, even with renders off.
 */
@Injectable()
export class VideoWorker implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker<VideoJob>;
  private purgeWorker?: Worker<VideoPurgeJob>;
  private purgeQueue?: Queue<VideoPurgeJob>;

  constructor(
    @Inject(RENDERER_CONFIG) private readonly config: RendererConfig,
    @Inject(RENDER_STORE) private readonly store: RenderStore,
    @Inject(VIDEO_STORAGE) private readonly storage: VideoStorage,
  ) {}

  async onModuleInit(): Promise<void> {
    const { video } = this.config;
    if (video.bucket) {
      this.purgeWorker = startPurgeWorker(
        {
          purge: (wrapId) => this.storage.purge(wrapId),
          sweep: () => sweepOrphanVideos(this.store, this.storage),
        },
        { redisUrl: this.config.redisUrl },
      );
      // One schedule in Redis, however many renderers run (a deploy overlaps two).
      this.purgeQueue = new Queue<VideoPurgeJob>(VIDEO_PURGE_QUEUE, {
        connection: { url: this.config.redisUrl },
      });
      await scheduleOrphanSweep(this.purgeQueue);
      logger.log(`videos go to the "${video.bucket.bucket}" bucket, swept daily`);
    }
    if (!video.enabled) {
      logger.log('video renders are off (RENDER_VIDEO_ENABLED)');
      return;
    }
    const processor = new VideoProcessor({
      store: this.store,
      storage: this.storage,
      render: createHyperframesRenderer(video.hyperframesBin),
      avatars: (url) => fetchAvatar(url, globalThis.fetch, VIDEO_AVATAR_PX),
      publicBaseUrl: this.config.publicBaseUrl,
      composition: video.composition,
      workDir: video.workDir,
      timeoutMs: video.timeoutMs,
      lowMemory: video.lowMemory,
    });
    await processor.sweepWorkDir();
    this.worker = startVideoWorker(processor, {
      redisUrl: this.config.redisUrl,
      concurrency: video.concurrency,
    });
    logger.log(
      `listening on "${VIDEO_QUEUE}" with concurrency ${video.concurrency}, ` +
        `timeout ${video.timeoutMs} ms, low memory: ${video.lowMemory}, ${video.composition}`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.worker?.close(), this.purgeWorker?.close(), this.purgeQueue?.close()]);
  }
}
