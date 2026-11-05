import { Module } from '@nestjs/common';
import { CoreModule } from './common/core.module';
import { HealthModule } from './health/health.module';
import { WrapsModule } from './wraps/wraps.module';

@Module({
  imports: [CoreModule, WrapsModule, HealthModule],
})
export class AppModule {}
