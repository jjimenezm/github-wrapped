import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { PublicWrap, WrapStatusView } from '@wrapped/shared';
import type { Response } from 'express';
import type { Identity } from '../auth/github-identity';
import { CurrentIdentity, OwnedWrap, OwnerGuard, parseYear, SessionGuard } from '../auth/guards';
import { RateLimit, RateLimitGuard } from '../common/rate-limit.guard';
import { cardStyleOf, localeOf } from '../common/validate';
import type { WrapRecord } from './wraps.repository';
import { WrapsService } from './wraps.service';

type Payload = Record<string, unknown> | undefined;

@Controller('wraps')
export class WrapsController {
  constructor(private readonly wraps: WrapsService) {}

  /** The public page's data (SSR): 404 never published, 410 deleted, 301 after a rename. */
  @Get(':login/:year')
  async publicWrap(
    @Param('login') login: string,
    @Param('year') year: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublicWrap | undefined> {
    const { wrap, moved } = await this.wraps.findPublic(login, parseYear(year));
    if (moved) {
      response.status(301).location(`/api/wraps/${encodeURIComponent(wrap.login)}/${wrap.year}`);
      return undefined;
    }
    return this.wraps.publicView(wrap);
  }

  /** Publish with a live session (the first publication usually goes through the GitHub login). */
  @Post(':login/publish')
  @UseGuards(RateLimitGuard, SessionGuard)
  @RateLimit('publish')
  async publish(
    @CurrentIdentity() identity: Identity,
    @Param('login') login: string,
    @Body() body: Payload,
  ): Promise<PublicWrap> {
    const wrap = await this.wraps.publish(identity, login, {
      cardStyle: cardStyleOf(body?.cardStyle),
      locale: localeOf(body?.locale),
    });
    return this.wraps.publicView(wrap);
  }

  @Get(':login/:year/status')
  @UseGuards(OwnerGuard)
  status(@OwnedWrap() wrap: WrapRecord): Promise<WrapStatusView> {
    return this.wraps.status(wrap);
  }

  @Post(':login/:year/regenerate')
  @HttpCode(200)
  @UseGuards(RateLimitGuard, OwnerGuard)
  @RateLimit('publish')
  async regenerate(@OwnedWrap() wrap: WrapRecord): Promise<PublicWrap> {
    return this.wraps.publicView(await this.wraps.regenerate(wrap));
  }

  @Put(':login/:year/card')
  @UseGuards(OwnerGuard)
  async changeCard(@OwnedWrap() wrap: WrapRecord, @Body() body: Payload): Promise<PublicWrap> {
    return this.wraps.publicView(await this.wraps.changeCard(wrap, cardStyleOf(body?.cardStyle)));
  }

  @Delete(':login/:year')
  @HttpCode(204)
  @UseGuards(OwnerGuard)
  async remove(@OwnedWrap() wrap: WrapRecord): Promise<void> {
    await this.wraps.remove(wrap);
  }

  @Post(':login/:year/images/retry')
  @HttpCode(200)
  @UseGuards(OwnerGuard)
  async retryImages(@OwnedWrap() wrap: WrapRecord): Promise<WrapStatusView> {
    return this.wraps.status(await this.wraps.retryImages(wrap));
  }
}
