import type { OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';

/** The renders the api asks for. The renderer (another service) does the work and reports back. */
export interface RenderQueue {
  enqueueImages(wrapId: string, imagesVersion: number): Promise<void>;
  /** Puts a failed image render back in line. */
  retryImages(wrapId: string, imagesVersion: number): Promise<void>;
  /** Drops every render of a wrap that hasn't started (the wrap was deleted). */
  cancelWrap(wrapId: string): Promise<void>;
  /** 1 = next in line; null when the render isn't waiting. */
  imagesPosition(wrapId: string, imagesVersion: number): Promise<number | null>;
}

export const RENDER_QUEUE = Symbol('RENDER_QUEUE');
export const IMAGES_QUEUE = 'images';

/** BullMQ forbids `:` in custom ids, and one id per version makes a repeated request harmless. */
export const imagesJobId = (wrapId: string, imagesVersion: number) =>
  `images-${wrapId}-${imagesVersion}`;

export interface ImagesJob {
  wrapId: string;
  imagesVersion: number;
}

export class BullRenderQueue implements RenderQueue, OnModuleDestroy {
  constructor(readonly images: Queue<ImagesJob>) {}

  static connect(redisUrl: string): BullRenderQueue {
    return new BullRenderQueue(
      new Queue<ImagesJob>(IMAGES_QUEUE, { connection: { url: redisUrl } }),
    );
  }

  async enqueueImages(wrapId: string, imagesVersion: number): Promise<void> {
    await this.images.add(
      'render',
      { wrapId, imagesVersion },
      {
        jobId: imagesJobId(wrapId, imagesVersion),
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 1_000,
        removeOnFail: 1_000,
      },
    );
  }

  async retryImages(wrapId: string, imagesVersion: number): Promise<void> {
    const job = await this.images.getJob(imagesJobId(wrapId, imagesVersion));
    if (job && (await job.isFailed())) await job.retry();
    else if (!job) await this.enqueueImages(wrapId, imagesVersion);
  }

  async cancelWrap(wrapId: string): Promise<void> {
    const pending = await this.images.getJobs(['waiting', 'delayed', 'prioritized']);
    await Promise.all(
      pending.filter((job) => job.data.wrapId === wrapId).map((job) => job.remove()),
    );
  }

  async imagesPosition(wrapId: string, imagesVersion: number): Promise<number | null> {
    // getWaiting lists the next job to run first.
    const waiting = await this.images.getWaiting();
    const index = waiting.findIndex((job) => job.id === imagesJobId(wrapId, imagesVersion));
    return index < 0 ? null : index + 1;
  }

  async onModuleDestroy(): Promise<void> {
    await this.images.close();
  }
}

/** Without Redis (tests, local development): remembers the requests, renders nothing. */
export class InMemoryRenderQueue implements RenderQueue {
  readonly jobs: Array<{
    id: string;
    wrapId: string;
    version: number;
    state: 'waiting' | 'cancelled';
  }> = [];
  readonly retried: string[] = [];

  enqueueImages(wrapId: string, version: number): Promise<void> {
    const id = imagesJobId(wrapId, version);
    if (!this.jobs.some((job) => job.id === id))
      this.jobs.push({ id, wrapId, version, state: 'waiting' });
    return Promise.resolve();
  }

  retryImages(wrapId: string, version: number): Promise<void> {
    this.retried.push(imagesJobId(wrapId, version));
    return Promise.resolve();
  }

  cancelWrap(wrapId: string): Promise<void> {
    for (const job of this.jobs) if (job.wrapId === wrapId) job.state = 'cancelled';
    return Promise.resolve();
  }

  imagesPosition(wrapId: string, version: number): Promise<number | null> {
    const waiting = this.jobs.filter((job) => job.state === 'waiting');
    const index = waiting.findIndex((job) => job.id === imagesJobId(wrapId, version));
    return Promise.resolve(index < 0 ? null : index + 1);
  }
}
