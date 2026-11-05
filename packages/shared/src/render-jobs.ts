/** The render queues both the api (producer) and the renderer (worker) use. */
export const IMAGES_QUEUE = 'images';
export const VIDEO_QUEUE = 'video';
/** Deleting a wrap whose videos live in the media bucket: the renderer, which holds its keys, empties it. */
export const VIDEO_PURGE_QUEUE = 'video-purge';

export interface ImagesJob {
  wrapId: string;
  imagesVersion: number;
}

/** One 30-second video per data version (publishing or regenerating); a card change keeps it. */
export interface VideoJob {
  wrapId: string;
  dataVersion: number;
}

/** A deleted wrap's videos; `wrapId: null` is the daily sweep of the videos no wrap uses. */
export interface VideoPurgeJob {
  wrapId: string | null;
}

/**
 * Daily at 05:00 UTC, after the Postgres backup: the bucket keeps only the videos in use (each
 * published wrap's ready one, and the one rendering), whatever a failed purge or sweep left.
 */
export const VIDEO_ORPHAN_SWEEP = { id: 'daily-orphan-sweep', pattern: '0 5 * * *' } as const;

/** One job id per wrap and version, so asking twice is harmless; BullMQ forbids `:` in ids. */
export const imagesJobId = (wrapId: string, imagesVersion: number) =>
  `images-${wrapId}-${imagesVersion}`;

export const videoJobId = (wrapId: string, dataVersion: number) => `video-${wrapId}-${dataVersion}`;

/** A few retries with backoff; once they run out the renderer marks the images failed. */
export const IMAGES_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: 1_000,
  removeOnFail: 1_000,
} as const;

/**
 * A render takes minutes, so one automatic retry (with the low-memory profile) and then the owner
 * decides. Failed jobs stay in Redis: retrying one means `retry()` on that same job, because adding
 * a job whose id already exists is silently ignored.
 */
export const VIDEO_JOB_OPTIONS = {
  attempts: 2,
  backoff: { type: 'fixed', delay: 30_000 },
  removeOnComplete: 1_000,
  removeOnFail: false,
} as const;

/** R2 can be out for a while: retries for about a quarter of an hour, kept if they all fail. */
export const VIDEO_PURGE_JOB_OPTIONS = {
  attempts: 6,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: 1_000,
  removeOnFail: false,
} as const;
