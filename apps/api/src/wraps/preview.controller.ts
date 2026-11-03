import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import type { WrapSnapshot } from '@wrapped/shared';
import { RateLimit, RateLimitGuard } from '../common/rate-limit.guard';
import { PreviewService } from './preview.service';

@Controller('preview')
@UseGuards(RateLimitGuard)
export class PreviewController {
  constructor(private readonly previews: PreviewService) {}

  /** A person's year before publishing, without login. Accepts `@Login` and pasted profile URLs. */
  @Get(':login')
  @RateLimit('preview')
  preview(@Param('login') login: string): Promise<WrapSnapshot> {
    return this.previews.preview(login);
  }
}
