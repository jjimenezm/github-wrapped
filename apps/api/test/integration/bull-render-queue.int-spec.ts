import { Queue, UnrecoverableError, Worker } from 'bullmq';
import { randomUUID } from 'node:crypto';
import {
  BullRenderQueue,
  imagesJobId,
  videoJobId,
  type ImagesJob,
  type VideoJob,
} from '../../src/render/render-queue';
import type { VideoPurgeJob } from '@wrapped/shared';

const url = process.env.REDIS_URL;
if (!url) throw new Error('Integration tests need REDIS_URL (a disposable Redis)');

describe('BullRenderQueue (real Redis)', () => {
  let images: Queue<ImagesJob>;
  let video: Queue<VideoJob>;
  let purge: Queue<VideoPurgeJob>;
  let queue: BullRenderQueue;

  beforeEach(() => {
    images = new Queue<ImagesJob>(`images-test-${randomUUID()}`, { connection: { url } });
    video = new Queue<VideoJob>(`video-test-${randomUUID()}`, { connection: { url } });
    purge = new Queue<VideoPurgeJob>(`purge-test-${randomUUID()}`, { connection: { url } });
    queue = new BullRenderQueue(images, video, purge);
  });

  afterEach(async () => {
    await Promise.all([images, video, purge].map((q) => q.obliterate({ force: true })));
    await Promise.all([images.close(), video.close(), purge.close()]);
  });

  /** A worker that gives up on the next video at once, as the renderer does on a timeout. */
  async function failNextVideo(): Promise<void> {
    const worker = new Worker<VideoJob>(
      video.name,
      () => Promise.reject(new UnrecoverableError('render timed out')),
      { connection: { url } },
    );
    await new Promise<void>((resolve) => worker.once('failed', () => resolve()));
    await worker.close();
  }

  it('queues one render per wrap and version, with an id BullMQ accepts', async () => {
    const wrapId = randomUUID();
    await queue.enqueueImages(wrapId, 1);
    await queue.enqueueImages(wrapId, 1);
    const jobs = await images.getWaiting();
    expect(jobs.map((job) => [job.id, job.data])).toEqual([
      [imagesJobId(wrapId, 1), { wrapId, imagesVersion: 1 }],
    ]);
    expect(jobs[0]?.id).not.toContain(':');
  });

  it('says where a render is in line', async () => {
    const [first, second] = [randomUUID(), randomUUID()];
    await queue.enqueueImages(first, 1);
    await queue.enqueueImages(second, 1);
    expect(await queue.imagesPosition(first, 1)).toBe(1);
    expect(await queue.imagesPosition(second, 1)).toBe(2);
    expect(await queue.imagesPosition(first, 2)).toBeNull();
  });

  it('cancels the pending renders of a deleted wrap only', async () => {
    const [deleted, kept] = [randomUUID(), randomUUID()];
    await queue.enqueueImages(deleted, 1);
    await queue.enqueueImages(deleted, 2);
    await queue.enqueueImages(kept, 1);
    await queue.enqueueVideo(deleted, 1);
    await queue.enqueueVideo(kept, 1);
    await queue.cancelWrap(deleted);
    expect((await images.getWaiting()).map((job) => job.data.wrapId)).toEqual([kept]);
    expect((await video.getWaiting()).map((job) => job.data.wrapId)).toEqual([kept]);
  });

  it('asks the renderer to empty a deleted wrap’s videos in the bucket', async () => {
    const wrapId = randomUUID();
    await queue.purgeVideos(wrapId);
    expect((await purge.getWaiting()).map((job) => job.data)).toEqual([{ wrapId }]);
  });

  it('queues a retry when the failed render is no longer kept', async () => {
    const wrapId = randomUUID();
    await queue.retryImages(wrapId, 3);
    expect((await images.getWaiting()).map((job) => job.id)).toEqual([imagesJobId(wrapId, 3)]);
  });

  describe('video', () => {
    it('keeps only the newest data version waiting when two arrive before the render starts', async () => {
      const [wrapId, other] = [randomUUID(), randomUUID()];
      await queue.enqueueVideo(wrapId, 1);
      await queue.enqueueVideo(other, 1);
      await queue.enqueueVideo(wrapId, 2);
      await queue.enqueueVideo(wrapId, 2);
      expect((await video.getWaiting()).map((job) => [job.id, job.data])).toEqual([
        [videoJobId(other, 1), { wrapId: other, dataVersion: 1 }],
        [videoJobId(wrapId, 2), { wrapId, dataVersion: 2 }],
      ]);
    });

    it('reports the third of three waiting videos at position 3', async () => {
      const wraps = [randomUUID(), randomUUID(), randomUUID()];
      for (const wrapId of wraps) await queue.enqueueVideo(wrapId, 1);
      expect(await queue.videoProgress(wraps[2], 1)).toEqual({ state: 'waiting', position: 3 });
      expect(await queue.videoProgress(wraps[0], 1)).toEqual({ state: 'waiting', position: 1 });
      expect(await queue.videoProgress(randomUUID(), 1)).toEqual({
        state: 'missing',
        position: null,
      });
    });

    it('keeps a timed-out render as failed, and retrying puts that same job back in line', async () => {
      const wrapId = randomUUID();
      await queue.enqueueVideo(wrapId, 1);
      await failNextVideo();
      expect(await queue.videoProgress(wrapId, 1)).toEqual({ state: 'failed', position: null });

      await queue.retryVideo(wrapId, 1);
      const waiting = await video.getWaiting();
      expect(waiting.map((job) => job.id)).toEqual([videoJobId(wrapId, 1)]);
      expect(await queue.videoProgress(wrapId, 1)).toEqual({ state: 'waiting', position: 1 });
    });

    it('drops a failed video of older data when the new version is queued', async () => {
      const wrapId = randomUUID();
      await queue.enqueueVideo(wrapId, 1);
      await failNextVideo();
      await queue.enqueueVideo(wrapId, 2);
      expect(await video.getJob(videoJobId(wrapId, 1))).toBeUndefined();
      expect((await video.getWaiting()).map((job) => job.id)).toEqual([videoJobId(wrapId, 2)]);
    });
  });
});
