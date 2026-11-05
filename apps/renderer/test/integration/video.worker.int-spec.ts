import {
  VIDEO_JOB_OPTIONS,
  VIDEO_ORPHAN_SWEEP,
  VIDEO_PURGE_JOB_OPTIONS,
  videoJobId,
  type VideoJob,
  type VideoPurgeJob,
} from '@wrapped/shared';
import { Queue, QueueEvents, type Worker } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_COMPOSITION } from '../../src/config';
import { InMemoryRenderStore } from '../../src/images/render-store';
import { RenderTimeoutError, type RenderRequest } from '../../src/video/hyperframes';
import { VideoProcessor } from '../../src/video/video.processor';
import {
  scheduleOrphanSweep,
  startPurgeWorker,
  startVideoWorker,
} from '../../src/video/video.worker';
import { VolumeVideoStorage } from '../../src/video/video-storage';
import { BASE_URL, renderableWrap, WRAP_ID } from '../fixtures';

const url = process.env.REDIS_URL;
if (!url) throw new Error('Integration tests need REDIS_URL (a disposable Redis)');

describe('video worker (real Redis and BullMQ)', () => {
  let queueName: string;
  let queue: Queue<VideoJob>;
  let events: QueueEvents;
  let worker: Worker<VideoJob> | undefined;

  beforeEach(async () => {
    queueName = `video-test-${randomUUID()}`;
    queue = new Queue<VideoJob>(queueName, { connection: { url } });
    events = new QueueEvents(queueName, { connection: { url } });
    await events.waitUntilReady();
  });

  afterEach(async () => {
    await worker?.close();
    await events.close();
    await queue.obliterate({ force: true });
    await queue.close();
  });

  async function start(render: (request: RenderRequest) => Promise<void>) {
    const root = await mkdtemp(join(tmpdir(), 'video-worker-'));
    const store = new InMemoryRenderStore([renderableWrap()]);
    const processor = new VideoProcessor({
      store,
      storage: new VolumeVideoStorage(root),
      render,
      avatars: () => Promise.resolve(null),
      publicBaseUrl: BASE_URL,
      composition: DEFAULT_COMPOSITION,
      workDir: join(root, '.renders'),
      timeoutMs: 600_000,
      lowMemory: 'retry',
    });
    worker = startVideoWorker(processor, { redisUrl: url as string, concurrency: 1, queueName });
    await worker.waitUntilReady();
    return { root, store };
  }

  const add = () =>
    queue.add(
      'render',
      { wrapId: WRAP_ID, dataVersion: 1 },
      {
        ...VIDEO_JOB_OPTIONS,
        backoff: { type: 'fixed', delay: 10 },
        jobId: videoJobId(WRAP_ID, 1),
      },
    );

  it('renders a queued video and marks it ready', async () => {
    const t = await start((request) => writeFile(request.output, 'mp4'));
    const job = await add();
    await job.waitUntilFinished(events, 30_000);
    expect(await readFile(join(t.root, WRAP_ID, 'video', '1.mp4'), 'utf8')).toBe('mp4');
    expect(t.store.get(WRAP_ID)?.videoStatus).toBe('ready');
  });

  it('retries once with the low-memory profile, then marks the video failed', async () => {
    const lowMemory: boolean[] = [];
    const t = await start((request) => {
      lowMemory.push(request.lowMemory);
      return Promise.reject(new Error('Chrome crashed'));
    });
    const job = await add();
    await expect(job.waitUntilFinished(events, 30_000)).rejects.toThrow(/Chrome crashed/);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(lowMemory).toEqual([false, true]);
    expect(t.store.get(WRAP_ID)?.videoStatus).toBe('failed');
  });

  it('fails a timed-out render at once, keeps it, and the owner’s retry runs it again', async () => {
    let calls = 0;
    const t = await start((request) => {
      calls++;
      if (calls === 1) return Promise.reject(new RenderTimeoutError(600_000));
      return writeFile(request.output, 'mp4');
    });
    const job = await add();
    await expect(job.waitUntilFinished(events, 30_000)).rejects.toThrow(/took more than 600 s/);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(calls).toBe(1);
    expect(t.store.get(WRAP_ID)?.videoStatus).toBe('failed');
    const kept = await queue.getJob(videoJobId(WRAP_ID, 1));
    expect(await kept?.getState()).toBe('failed');

    await kept?.retry('failed');
    await kept?.waitUntilFinished(events, 30_000);
    expect(calls).toBe(2);
    expect(t.store.get(WRAP_ID)?.videoStatus).toBe('ready');
  });

  it('empties a deleted wrap’s videos from the bucket, retrying while it fails', async () => {
    const purgeName = `video-purge-test-${randomUUID()}`;
    const purges = new Queue<VideoPurgeJob>(purgeName, { connection: { url } });
    const purgeEvents = new QueueEvents(purgeName, { connection: { url } });
    await purgeEvents.waitUntilReady();
    let calls = 0;
    const purged: string[] = [];
    const purgeWorker = startPurgeWorker(
      {
        purge: (wrapId) => {
          calls++;
          if (calls === 1) return Promise.reject(new Error('R2 answered 503'));
          purged.push(wrapId);
          return Promise.resolve();
        },
        sweep: () => Promise.resolve(0),
      },
      { redisUrl: url, queueName: purgeName },
    );
    try {
      const job = await purges.add(
        'purge',
        { wrapId: WRAP_ID },
        { ...VIDEO_PURGE_JOB_OPTIONS, backoff: { type: 'fixed', delay: 10 } },
      );
      await job.waitUntilFinished(purgeEvents, 30_000);
      expect(purged).toEqual([WRAP_ID]);
      expect(calls).toBe(2);
    } finally {
      await purgeWorker.close();
      await purgeEvents.close();
      await purges.obliterate({ force: true });
      await purges.close();
    }
  });

  it('runs the daily sweep from a single schedule, however many times it is set up', async () => {
    const purgeName = `video-purge-test-${randomUUID()}`;
    const purges = new Queue<VideoPurgeJob>(purgeName, { connection: { url } });
    const purgeEvents = new QueueEvents(purgeName, { connection: { url } });
    await purgeEvents.waitUntilReady();
    const sweep = jest.fn(() => Promise.resolve(2));
    const purgeWorker = startPurgeWorker(
      { purge: () => Promise.reject(new Error('not this one')), sweep },
      { redisUrl: url, queueName: purgeName },
    );
    try {
      await scheduleOrphanSweep(purges);
      await scheduleOrphanSweep(purges);
      const schedulers = await purges.getJobSchedulers();
      expect(schedulers.map((s) => [s.key, s.pattern, s.tz])).toEqual([
        [VIDEO_ORPHAN_SWEEP.id, VIDEO_ORPHAN_SWEEP.pattern, 'UTC'],
      ]);

      // The sweep the schedule queues: a purge job without a wrap.
      const job = await purges.add('sweep', { wrapId: null });
      await job.waitUntilFinished(purgeEvents, 30_000);
      expect(sweep).toHaveBeenCalledTimes(1);
    } finally {
      await purgeWorker.close();
      await purgeEvents.close();
      await purges.obliterate({ force: true });
      await purges.close();
    }
  });
});
