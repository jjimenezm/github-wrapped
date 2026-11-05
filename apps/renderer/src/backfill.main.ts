import { PrismaClient } from '@prisma/client';
import {
  IMAGES_JOB_OPTIONS,
  IMAGES_QUEUE,
  imagesJobId,
  VIDEO_JOB_OPTIONS,
  VIDEO_QUEUE,
  videoJobId,
  type ImagesJob,
  type VideoJob,
} from '@wrapped/shared';
import { Queue } from 'bullmq';
import { backfillImages, backfillVideos } from './backfill';
import { loadRendererConfig } from './config';
import { ImageFiles } from './images/image-files';
import { PrismaRenderStore } from './images/prisma-render-store';
import { createVideoStorage } from './video/video-storage';

/** States in which a video job is still going to render. */
const IN_FLIGHT = new Set(['waiting', 'active', 'delayed', 'prioritized', 'waiting-children']);

/**
 * `pnpm --filter @wrapped/renderer render:backfill`: re-queues the images missing on the volume
 * and, with RENDER_VIDEO_ENABLED, the videos.
 */
async function main() {
  const config = loadRendererConfig(process.env);
  const prisma = new PrismaClient({ datasourceUrl: config.databaseUrl });
  const connection = { url: config.redisUrl };
  const images = new Queue<ImagesJob>(IMAGES_QUEUE, { connection });
  const video = new Queue<VideoJob>(VIDEO_QUEUE, { connection });
  const store = new PrismaRenderStore(prisma);
  try {
    const queuedImages = await backfillImages(store, new ImageFiles(config.filesDir), {
      enqueueImages: async (wrapId, imagesVersion) => {
        await images.add(
          'render',
          { wrapId, imagesVersion },
          { ...IMAGES_JOB_OPTIONS, jobId: imagesJobId(wrapId, imagesVersion) },
        );
      },
    });
    console.log(`Queued ${queuedImages} image render(s).`);
    if (!config.video.enabled) return;

    const queuedVideos = await backfillVideos(store, createVideoStorage(config), {
      enqueueVideo: async (wrapId, dataVersion) => {
        const jobId = videoJobId(wrapId, dataVersion);
        const existing = await video.getJob(jobId);
        if (existing) {
          if (IN_FLIGHT.has(await existing.getState())) return false;
          // Finished or failed, yet the file is missing (a lost volume): same id, so make room.
          await existing.remove();
        }
        await video.add('render', { wrapId, dataVersion }, { ...VIDEO_JOB_OPTIONS, jobId });
        return true;
      },
    });
    console.log(`Queued ${queuedVideos} video render(s).`);
  } finally {
    await Promise.all([images.close(), video.close()]);
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
