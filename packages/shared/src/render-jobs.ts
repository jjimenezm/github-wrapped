/** The render queue both the api (producer) and the renderer (worker) use. */
export const IMAGES_QUEUE = 'images';

export interface ImagesJob {
  wrapId: string;
  imagesVersion: number;
}

/** One job id per wrap and version, so asking twice is harmless; BullMQ forbids `:` in ids. */
export const imagesJobId = (wrapId: string, imagesVersion: number) =>
  `images-${wrapId}-${imagesVersion}`;

/** A few retries with backoff; once they run out the renderer marks the images failed. */
export const IMAGES_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: 1_000,
  removeOnFail: 1_000,
} as const;
