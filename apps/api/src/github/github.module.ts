import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config';
import { GithubClient } from './github.client';
import {
  FixtureGithubTransport,
  GITHUB_TRANSPORT,
  HttpGithubTransport,
  type GithubTransport,
} from './github.transport';
import { SnapshotBuilder } from './snapshot.builder';

@Module({
  providers: [
    {
      provide: GITHUB_TRANSPORT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): GithubTransport =>
        config.fixturesDir
          ? new FixtureGithubTransport(config.fixturesDir)
          : new HttpGithubTransport({ token: config.githubToken ?? '' }),
    },
    {
      provide: GithubClient,
      inject: [GITHUB_TRANSPORT],
      useFactory: (transport: GithubTransport) => new GithubClient(transport),
    },
    {
      provide: SnapshotBuilder,
      inject: [GithubClient],
      useFactory: (client: GithubClient) => new SnapshotBuilder(client),
    },
  ],
  exports: [SnapshotBuilder],
})
export class GithubModule {}
