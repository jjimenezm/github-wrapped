import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { loadRendererConfig, RENDERER_CONFIG, type RendererConfig } from './config';
import { HEALTH_PROBES, HealthController } from './health/health.controller';
import { redisProbe, volumeProbe } from './health/health.probes';
import { ImagesWorker } from './images/images.worker';
import { PrismaRenderStore } from './images/prisma-render-store';
import { RENDER_STORE } from './images/render-store';
import { VideoWorker } from './video/video.worker';
import { createVideoStorage, VIDEO_STORAGE } from './video/video-storage';

@Module({
  controllers: [HealthController],
  providers: [
    { provide: RENDERER_CONFIG, useFactory: () => loadRendererConfig(process.env) },
    {
      provide: RENDER_STORE,
      inject: [RENDERER_CONFIG],
      useFactory: (config: RendererConfig) =>
        new PrismaRenderStore(new PrismaClient({ datasourceUrl: config.databaseUrl })),
    },
    {
      provide: VIDEO_STORAGE,
      inject: [RENDERER_CONFIG],
      useFactory: (config: RendererConfig) => createVideoStorage(config),
    },
    ImagesWorker,
    VideoWorker,
    {
      provide: HEALTH_PROBES,
      inject: [RENDERER_CONFIG, ImagesWorker],
      useFactory: (config: RendererConfig, images: ImagesWorker) => [
        redisProbe(() => images.running),
        volumeProbe(config.filesDir, { requireMount: config.requireFilesVolume }),
      ],
    },
  ],
})
export class AppModule {}
