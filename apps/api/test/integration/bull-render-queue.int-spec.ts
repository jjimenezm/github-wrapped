import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { BullRenderQueue, imagesJobId, type ImagesJob } from '../../src/render/render-queue';

const url = process.env.REDIS_URL;
if (!url) throw new Error('Integration tests need REDIS_URL (a disposable Redis)');

describe('BullRenderQueue (real Redis)', () => {
  let images: Queue<ImagesJob>;
  let queue: BullRenderQueue;

  beforeEach(() => {
    images = new Queue<ImagesJob>(`images-test-${randomUUID()}`, { connection: { url } });
    queue = new BullRenderQueue(images);
  });

  afterEach(async () => {
    await images.obliterate({ force: true });
    await images.close();
  });

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
    await queue.cancelWrap(deleted);
    expect((await images.getWaiting()).map((job) => job.data.wrapId)).toEqual([kept]);
  });

  it('queues a retry when the failed render is no longer kept', async () => {
    const wrapId = randomUUID();
    await queue.retryImages(wrapId, 3);
    expect((await images.getWaiting()).map((job) => job.id)).toEqual([imagesJobId(wrapId, 3)]);
  });
});
