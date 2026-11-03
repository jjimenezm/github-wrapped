import { Module } from '@nestjs/common';
import { CoreModule } from './common/core.module';
import { WrapsModule } from './wraps/wraps.module';

@Module({
  imports: [CoreModule, WrapsModule],
})
export class AppModule {}
