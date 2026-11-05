import type { OnModuleDestroy } from '@nestjs/common';
import {
  IMAGES_JOB_OPTIONS,
  IMAGES_QUEUE,
  imagesJobId,
  VIDEO_JOB_OPTIONS,
  VIDEO_PURGE_JOB_OPTIONS,
  VIDEO_PURGE_QUEUE,
  VIDEO_QUEUE,
  videoJobId,
  type ImagesJob,
  type VideoJob,
  type VideoPurgeJob,
} from '@wrapped/shared';
import { Queue, type Job } from 'bullmq';

/**
 * Where a video render is, as the queue sees it. `missing` when the queue no longer knows the job
 * (it finished long ago, or Redis was emptied), so the stored status is all there is.
 */
export type VideoJobState = 'waiting' | 'active' | 'failed' | 'done' | 'missing';

export interface VideoProgress {
  state: VideoJobState;
  /** 1 = next in line; null unless waiting its turn. */
  position: number | null;
}

/** The renders the api asks for. The renderer (another service) does the work and reports back. */
export interface RenderQueue {
  enqueueImages(wrapId: string, imagesVersion: number): Promise<void>;
  /** Puts a failed image render back in line. */
  retryImages(wrapId: string, imagesVersion: number): Promise<void>;
  /**
   * Queues the video of a data version and drops the waiting ones of older versions of the same
   * wrap: only the current data gets rendered.
   */
  enqueueVideo(wrapId: string, dataVersion: number): Promise<void>;
  /** Puts the failed video render back in line (the same job, so its id stays the same). */
  retryVideo(wrapId: string, dataVersion: number): Promise<void>;
  videoProgress(wrapId: string, dataVersion: number): Promise<VideoProgress>;
  /** Drops every render of a wrap that hasn't started (the wrap was deleted). */
  cancelWrap(wrapId: string): Promise<void>;
  /** The wrap was deleted and its videos live in the media bucket: the renderer empties it. */
  purgeVideos(wrapId: string): Promise<void>;
  /** 1 = next in line; null when the render isn't waiting. */
  imagesPosition(wrapId: string, imagesVersion: number): Promise<number | null>;
}

export const RENDER_QUEUE = Symbol('RENDER_QUEUE');

// The job shape and ids are shared with the renderer, which consumes the same queues.
export { imagesJobId, videoJobId, type ImagesJob, type VideoJob } from '@wrapped/shared';

/** States of a job that hasn't started; the renderer can still take it, so it can be dropped. */
const PENDING = ['waiting', 'delayed', 'prioritized'] as const;

/** Removing a job the worker took a moment ago fails (it is locked); that one runs anyway. */
const removeQuietly = (job: Job) => job.remove().catch(() => undefined);

export class BullRenderQueue implements RenderQueue, OnModuleDestroy {
  constructor(
    readonly images: Queue<ImagesJob>,
    readonly video: Queue<VideoJob>,
    readonly purge: Queue<VideoPurgeJob>,
  ) {}

  static connect(redisUrl: string): BullRenderQueue {
    const connection = { url: redisUrl };
    return new BullRenderQueue(
      new Queue<ImagesJob>(IMAGES_QUEUE, { connection }),
      new Queue<VideoJob>(VIDEO_QUEUE, { connection }),
      new Queue<VideoPurgeJob>(VIDEO_PURGE_QUEUE, { connection }),
    );
  }

  async enqueueImages(wrapId: string, imagesVersion: number): Promise<void> {
    await this.images.add(
      'render',
      { wrapId, imagesVersion },
      { ...IMAGES_JOB_OPTIONS, jobId: imagesJobId(wrapId, imagesVersion) },
    );
  }

  async retryImages(wrapId: string, imagesVersion: number): Promise<void> {
    const job = await this.images.getJob(imagesJobId(wrapId, imagesVersion));
    if (job && (await job.isFailed())) await job.retry();
    else if (!job) await this.enqueueImages(wrapId, imagesVersion);
  }

  async enqueueVideo(wrapId: string, dataVersion: number): Promise<void> {
    // Failed ones of older versions go too: the owner can only retry the current data's video.
    const older = await this.video.getJobs([...PENDING, 'failed']);
    await Promise.all(
      older
        .filter((job) => job.data.wrapId === wrapId && job.data.dataVersion < dataVersion)
        .map(removeQuietly),
    );
    await this.video.add(
      'render',
      { wrapId, dataVersion },
      { ...VIDEO_JOB_OPTIONS, jobId: videoJobId(wrapId, dataVersion) },
    );
  }

  async retryVideo(wrapId: string, dataVersion: number): Promise<void> {
    const job = await this.video.getJob(videoJobId(wrapId, dataVersion));
    if (job && (await job.isFailed())) await job.retry('failed');
    else if (!job) await this.enqueueVideo(wrapId, dataVersion);
  }

  async videoProgress(wrapId: string, dataVersion: number): Promise<VideoProgress> {
    const id = videoJobId(wrapId, dataVersion);
    const job = await this.video.getJob(id);
    if (!job) return { state: 'missing', position: null };
    switch (await job.getState()) {
      case 'active':
        return { state: 'active', position: null };
      case 'failed':
        return { state: 'failed', position: null };
      case 'completed':
        return { state: 'done', position: null };
      case 'unknown':
        return { state: 'missing', position: null };
      default: {
        // Waiting (or backing off before its automatic retry, which has no place in line yet).
        const waiting = await this.video.getWaiting();
        const index = waiting.findIndex((candidate) => candidate.id === id);
        return { state: 'waiting', position: index < 0 ? null : index + 1 };
      }
    }
  }

  async cancelWrap(wrapId: string): Promise<void> {
    const [images, video] = await Promise.all([
      this.images.getJobs([...PENDING]),
      this.video.getJobs([...PENDING, 'failed']),
    ]);
    await Promise.all(
      [...images, ...video].filter((job) => job.data.wrapId === wrapId).map(removeQuietly),
    );
  }

  async purgeVideos(wrapId: string): Promise<void> {
    await this.purge.add('purge', { wrapId }, VIDEO_PURGE_JOB_OPTIONS);
  }

  async imagesPosition(wrapId: string, imagesVersion: number): Promise<number | null> {
    // getWaiting lists the next job to run first.
    const waiting = await this.images.getWaiting();
    const index = waiting.findIndex((job) => job.id === imagesJobId(wrapId, imagesVersion));
    return index < 0 ? null : index + 1;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.images.close(), this.video.close(), this.purge.close()]);
  }
}

interface MemoryJob {
  id: string;
  wrapId: string;
  version: number;
  state: 'waiting' | 'cancelled';
}

interface MemoryVideoJob {
  id: string;
  wrapId: string;
  version: number;
  state: 'waiting' | 'active' | 'failed' | 'done' | 'cancelled';
}

/** Without Redis (tests, local development): remembers the requests, renders nothing. */
export class InMemoryRenderQueue implements RenderQueue {
  readonly jobs: MemoryJob[] = [];
  /** The video queue; tests move a job through its states with `setVideoState`. */
  videoJobs: MemoryVideoJob[] = [];
  readonly retried: string[] = [];
  /** Wraps whose bucket the renderer was asked to empty. */
  readonly purged: string[] = [];

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

  enqueueVideo(wrapId: string, version: number): Promise<void> {
    this.videoJobs = this.videoJobs.filter(
      (job) =>
        !(
          job.wrapId === wrapId &&
          job.version < version &&
          ['waiting', 'failed'].includes(job.state)
        ),
    );
    const id = videoJobId(wrapId, version);
    if (!this.videoJobs.some((job) => job.id === id))
      this.videoJobs.push({ id, wrapId, version, state: 'waiting' });
    return Promise.resolve();
  }

  retryVideo(wrapId: string, version: number): Promise<void> {
    const id = videoJobId(wrapId, version);
    this.retried.push(id);
    const job = this.videoJobs.find((candidate) => candidate.id === id);
    if (job?.state === 'failed') job.state = 'waiting';
    else if (!job) return this.enqueueVideo(wrapId, version);
    return Promise.resolve();
  }

  videoProgress(wrapId: string, version: number): Promise<VideoProgress> {
    const id = videoJobId(wrapId, version);
    const job = this.videoJobs.find((candidate) => candidate.id === id);
    if (!job || job.state === 'cancelled') {
      return Promise.resolve({ state: 'missing', position: null });
    }
    const waiting = this.videoJobs.filter((candidate) => candidate.state === 'waiting');
    const index = waiting.indexOf(job);
    return Promise.resolve({ state: job.state, position: index < 0 ? null : index + 1 });
  }

  /** Tests: the renderer took the job, finished it or gave up. */
  setVideoState(wrapId: string, version: number, state: MemoryVideoJob['state']): void {
    const job = this.videoJobs.find((candidate) => candidate.id === videoJobId(wrapId, version));
    if (!job) throw new Error(`no video job for ${wrapId} v${version}`);
    job.state = state;
  }

  cancelWrap(wrapId: string): Promise<void> {
    for (const job of this.jobs) if (job.wrapId === wrapId) job.state = 'cancelled';
    for (const job of this.videoJobs) {
      if (job.wrapId === wrapId && ['waiting', 'failed'].includes(job.state)) {
        job.state = 'cancelled';
      }
    }
    return Promise.resolve();
  }

  purgeVideos(wrapId: string): Promise<void> {
    this.purged.push(wrapId);
    return Promise.resolve();
  }

  imagesPosition(wrapId: string, version: number): Promise<number | null> {
    const waiting = this.jobs.filter((job) => job.state === 'waiting');
    const index = waiting.findIndex((job) => job.id === imagesJobId(wrapId, version));
    return Promise.resolve(index < 0 ? null : index + 1);
  }
}
