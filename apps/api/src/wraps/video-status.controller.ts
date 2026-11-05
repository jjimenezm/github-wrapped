import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import type { WrapStatusView } from '@wrapped/shared';
import { OwnedWrap, OwnerGuard } from '../auth/guards';
import { RateLimit, RateLimitGuard } from '../common/rate-limit.guard';
import type { WrapRecord } from './wraps.repository';
import { WrapsService } from './wraps.service';

/**
 * The video's own actions. Its status travels with the images' (`GET …/status`), which the share
 * screen already polls; retrying is the owner's, and limited like publishing, since a render costs
 * minutes of the server's CPU.
 */
@Controller('wraps')
export class VideoStatusController {
  constructor(private readonly wraps: WrapsService) {}

  @Post(':login/:year/video/retry')
  @HttpCode(200)
  @UseGuards(RateLimitGuard, OwnerGuard)
  @RateLimit('publish')
  async retry(@OwnedWrap() wrap: WrapRecord): Promise<WrapStatusView> {
    return this.wraps.status(await this.wraps.retryVideo(wrap));
  }
}
