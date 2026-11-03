import { Queue, QueueEvents, type Worker } from 'bullmq';
import type { ImagesJob } from '@wrapped/shared';
import { mkdtemp, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FONTS_DIR } from '../../src/config';
import { ImageFiles } from '../../src/images/image-files';
import { ImagesProcessor } from '../../src/images/images.processor';
import { startImagesWorker } from '../../src/images/images.worker';
import { createRasterizer } from '../../src/images/rasterizer';
import { InMemoryRenderStore } from '../../src/images/render-store';
import { BASE_URL, renderableWrap, WRAP_ID } from '../fixtures';

const url = process.env.REDIS_URL;
if (!url) throw new Error('Integration tests need REDIS_URL (a disposable Redis)');

describe('images worker (real Redis and BullMQ)', () => {
  let queueName: string;
  let queue: Queue<ImagesJob>;
  let events: QueueEvents;
  let worker: Worker<ImagesJob> | undefined;

  beforeEach(async () => {
    queueName = `images-test-${randomUUID()}`;
    queue = new Queue<ImagesJob>(queueName, { connection: { url } });
    events = new QueueEvents(queueName, { connection: { url } });
    await events.waitUntilReady();
  });

  afterEach(async () => {
    await worker?.close();
    await events.close();
    await queue.obliterate({ force: true });
    await queue.close();
  });

  async function start(files: ImageFiles, store: InMemoryRenderStore) {
    const processor = new ImagesProcessor({
      store,
      files,
      rasterize: createRasterizer(FONTS_DIR),
      avatars: () => Promise.resolve(null),
      publicBaseUrl: BASE_URL,
    });
    worker = startImagesWorker(processor, { redisUrl: url as string, concurrency: 1, queueName });
    await worker.waitUntilReady();
  }

  it('renders a queued job and marks the images ready', async () => {
    const root = await mkdtemp(join(tmpdir(), 'worker-'));
    const store = new InMemoryRenderStore([renderableWrap()]);
    await start(new ImageFiles(root), store);
    const job = await queue.add('render', { wrapId: WRAP_ID, imagesVersion: 1 });
    await job.waitUntilFinished(events, 30_000);
    expect(await readdir(join(root, WRAP_ID, 'img', '1'))).toEqual(['card.png', 'og.png']);
    expect(store.get(WRAP_ID)?.imagesStatus).toBe('ready');
  });

  it('retries a failing render and marks it failed once the attempts run out', async () => {
    const files = new ImageFiles(await mkdtemp(join(tmpdir(), 'worker-')));
    const write = jest.spyOn(files, 'write').mockRejectedValue(new Error('EIO: disk failed'));
    const store = new InMemoryRenderStore([renderableWrap()]);
    await start(files, store);
    const job = await queue.add('render', { wrapId: WRAP_ID, imagesVersion: 1 }, { attempts: 2 });
    await expect(job.waitUntilFinished(events, 30_000)).rejects.toThrow(/EIO/);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(write).toHaveBeenCalledTimes(2);
    expect(store.get(WRAP_ID)?.imagesStatus).toBe('failed');
    expect(worker?.isRunning()).toBe(true);
  });
});
