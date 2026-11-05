import { Logger, Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AuthController } from '../auth/auth.controller';
import {
  FixtureGithubIdentity,
  GITHUB_IDENTITY,
  HttpGithubIdentity,
  type GithubIdentity,
} from '../auth/github-identity';
import { OwnerGuard, SessionGuard } from '../auth/guards';
import { SessionService } from '../auth/session.service';
import { APP_CONFIG, type AppConfig } from '../config';
import { FilesController } from '../files/files.controller';
import { WRAP_FILES, WrapFiles } from '../files/wrap-files';
import { GithubModule } from '../github/github.module';
import {
  BullRenderQueue,
  InMemoryRenderQueue,
  RENDER_QUEUE,
  type RenderQueue,
} from '../render/render-queue';
import { PreviewController } from './preview.controller';
import { PreviewService } from './preview.service';
import { PrismaWrapsRepository } from './prisma-wraps.repository';
import { WrapsController } from './wraps.controller';
import {
  InMemoryWrapsRepository,
  WRAPS_REPOSITORY,
  type WrapsRepository,
} from './wraps.repository';
import { VideoStatusController } from './video-status.controller';
import { VIDEO_CONFIG, WrapsService } from './wraps.service';

const logger = new Logger('WrapsModule');

@Module({
  imports: [GithubModule],
  controllers: [
    PreviewController,
    WrapsController,
    VideoStatusController,
    AuthController,
    FilesController,
  ],
  providers: [
    PreviewService,
    WrapsService,
    SessionService,
    SessionGuard,
    OwnerGuard,
    {
      provide: WRAPS_REPOSITORY,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): WrapsRepository => {
        if (config.databaseUrl) {
          return new PrismaWrapsRepository(new PrismaClient({ datasourceUrl: config.databaseUrl }));
        }
        logger.warn('DATABASE_URL is not set: published wraps live in memory until a restart');
        return new InMemoryWrapsRepository();
      },
    },
    {
      provide: VIDEO_CONFIG,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => config.video,
    },
    {
      provide: RENDER_QUEUE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): RenderQueue => {
        if (config.redisUrl) return BullRenderQueue.connect(config.redisUrl);
        logger.warn('REDIS_URL is not set: renders are recorded but nothing renders them');
        return new InMemoryRenderQueue();
      },
    },
    {
      provide: WRAP_FILES,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new WrapFiles(config.filesDir),
    },
    {
      provide: GITHUB_IDENTITY,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): GithubIdentity =>
        config.fixturesDir
          ? new FixtureGithubIdentity()
          : new HttpGithubIdentity({
              clientId: config.oauth.clientId ?? '',
              clientSecret: config.oauth.clientSecret ?? '',
            }),
    },
  ],
  // The health check asks the same Postgres client the wraps use.
  exports: [WRAPS_REPOSITORY],
})
export class WrapsModule {}
