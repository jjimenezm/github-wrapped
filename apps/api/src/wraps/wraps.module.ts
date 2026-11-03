import { Module } from '@nestjs/common';
import { GithubModule } from '../github/github.module';
import { PreviewController } from './preview.controller';
import { PreviewService } from './preview.service';

@Module({
  imports: [GithubModule],
  controllers: [PreviewController],
  providers: [PreviewService],
})
export class WrapsModule {}
