import { Module } from '@nestjs/common';
import { STORE, type KeyValueStore } from '../common/store';
import { WrapsModule } from '../wraps/wraps.module';
import { WRAPS_REPOSITORY, type WrapsRepository } from '../wraps/wraps.repository';
import { HEALTH_PROBES, HealthController } from './health.controller';
import { healthProbes } from './health.probes';

@Module({
  imports: [WrapsModule],
  controllers: [HealthController],
  providers: [
    {
      provide: HEALTH_PROBES,
      inject: [WRAPS_REPOSITORY, STORE],
      useFactory: (wraps: WrapsRepository, store: KeyValueStore) => healthProbes(wraps, store),
    },
  ],
})
export class HealthModule {}
