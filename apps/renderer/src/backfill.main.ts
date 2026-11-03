import { PrismaClient } from '@prisma/client';
import { IMAGES_JOB_OPTIONS, IMAGES_QUEUE, imagesJobId, type ImagesJob } from '@wrapped/shared';
import { Queue } from 'bullmq';
import { backfillImages } from './backfill';
import { loadRendererConfig } from './config';
import { ImageFiles } from './images/image-files';
import { PrismaRenderStore } from './images/prisma-render-store';

/** `pnpm --filter @wrapped/renderer render:backfill`: re-queues the images missing on the volume. */
async function main() {
  const config = loadRendererConfig(process.env);
  const prisma = new PrismaClient({ datasourceUrl: config.databaseUrl });
  const queue = new Queue<ImagesJob>(IMAGES_QUEUE, { connection: { url: config.redisUrl } });
  try {
    const queued = await backfillImages(
      new PrismaRenderStore(prisma),
      new ImageFiles(config.filesDir),
      {
        enqueueImages: async (wrapId, imagesVersion) => {
          await queue.add(
            'render',
            { wrapId, imagesVersion },
            { ...IMAGES_JOB_OPTIONS, jobId: imagesJobId(wrapId, imagesVersion) },
          );
        },
      },
    );
    console.log(`Queued ${queued} image render(s).`);
  } finally {
    await queue.close();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
