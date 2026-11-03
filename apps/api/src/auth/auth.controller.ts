import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { normalizeLogin } from '@wrapped/shared';
import type { Request, Response } from 'express';
import { InvalidRequestError } from '../common/invalid-request.error';
import { RateLimit, RateLimitGuard } from '../common/rate-limit.guard';
import { cardStyleOf, intentOf, localeOf } from '../common/validate';
import { APP_CONFIG, type AppConfig } from '../config';
import {
  GithubRateLimitError,
  GithubUnavailableError,
  UserNotFoundError,
} from '../github/github.errors';
import {
  NotOwnerError,
  RegenerateTooSoonError,
  WrapDeletedError,
  WrapNotFoundError,
  YearFrozenError,
} from '../wraps/wrap.errors';
import type { WrapRecord } from '../wraps/wraps.repository';
import { WrapsService } from '../wraps/wraps.service';
import { GITHUB_IDENTITY, type GithubIdentity, type Identity } from './github-identity';
import { parseYear } from './guards';
import { SessionService, UnauthenticatedError, type OAuthRequest } from './session.service';

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';

/** Errors the callback reports to the web as `?oauth_error=<code>` instead of a JSON body. */
const CALLBACK_ERRORS: Array<[new (...args: never[]) => Error, string]> = [
  [NotOwnerError, 'WRONG_ACCOUNT'],
  [RegenerateTooSoonError, 'REGENERATE_TOO_SOON'],
  [YearFrozenError, 'YEAR_FROZEN'],
  [WrapNotFoundError, 'WRAP_NOT_FOUND'],
  [WrapDeletedError, 'WRAP_DELETED'],
  [UserNotFoundError, 'USER_NOT_FOUND'],
  [GithubRateLimitError, 'GITHUB_RATE_LIMITED'],
  [GithubUnavailableError, 'GITHUB_UNAVAILABLE'],
];

type Query = Record<string, string | undefined>;

/**
 * "Continuar con GitHub" (R5, R6): identity only, no scopes. The web says what it wants (publish,
 * change the card, manage); the api checks the signed-in account owns that login before acting.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly sessions: SessionService,
    private readonly wraps: WrapsService,
    @Inject(GITHUB_IDENTITY) private readonly identity: GithubIdentity,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('github')
  @UseGuards(RateLimitGuard)
  @RateLimit('publish')
  start(@Query() query: Query, @Res() response: Response): void {
    const state = this.sessions.startOAuth(response, this.parse(query));
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('client_id', this.config.oauth.clientId ?? 'fixture');
    url.searchParams.set('redirect_uri', this.callbackUrl);
    url.searchParams.set('state', state);
    url.searchParams.set('allow_signup', 'false');
    response.redirect(302, url.toString());
  }

  @Get('github/callback')
  async callback(
    @Query() query: Query,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const wanted = this.sessions.finishOAuth(request, response, query.state ?? '');
    let identity: Identity;
    try {
      identity = await this.identity.identify(query.code ?? '', this.callbackUrl);
    } catch {
      return this.backWithError(response, wanted.login, 'OAUTH_FAILED');
    }

    this.sessions.open(response, identity);
    try {
      await this.wraps.syncLogin(identity);
      const wrap = await this.act(identity, wanted);
      response.redirect(302, `${this.config.publicBaseUrl}/@${wrap.login}/${wrap.year}/share`);
    } catch (error) {
      const code = CALLBACK_ERRORS.find(([type]) => error instanceof type)?.[1];
      if (!code) throw error;
      const retryAt = error instanceof RegenerateTooSoonError ? error.retryAt : undefined;
      this.backWithError(response, wanted.login, code, retryAt);
    }
  }

  @Get('session')
  session(@Req() request: Request): Identity {
    const identity = this.sessions.read(request);
    if (!identity) throw new UnauthenticatedError();
    return identity;
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) response: Response): void {
    this.sessions.close(response);
  }

  private get callbackUrl() {
    return `${this.config.apiBaseUrl}/api/auth/github/callback`;
  }

  private act(identity: Identity, wanted: OAuthRequest): Promise<WrapRecord> {
    const { login, intent, cardStyle, locale, year } = wanted;
    if (intent === 'publish' && cardStyle && locale) {
      return this.wraps.publish(identity, login, { cardStyle, locale });
    }
    if (intent === 'change-card' && cardStyle && year) {
      return this.wraps
        .findOwned(identity, login, year)
        .then((wrap) => this.wraps.changeCard(wrap, cardStyle));
    }
    if (intent === 'manage' && year) return this.wraps.findOwned(identity, login, year);
    throw new InvalidRequestError('intent');
  }

  /** Validates what the web asked for before anyone is sent to GitHub. */
  private parse(query: Query): OAuthRequest {
    const login = normalizeLogin(query.login ?? '');
    if (!login) throw new InvalidRequestError('login');
    const intent = intentOf(query.intent);
    switch (intent) {
      case 'publish':
        return {
          login,
          intent,
          cardStyle: cardStyleOf(query.style),
          locale: localeOf(query.locale),
        };
      case 'change-card':
        return {
          login,
          intent,
          cardStyle: cardStyleOf(query.style),
          year: parseYear(query.year ?? ''),
        };
      case 'manage':
        return { login, intent, year: parseYear(query.year ?? '') };
    }
  }

  private backWithError(response: Response, login: string, code: string, retryAt?: Date) {
    const url = new URL(`${this.config.publicBaseUrl}/`);
    url.searchParams.set('oauth_error', code);
    url.searchParams.set('login', login);
    if (retryAt) url.searchParams.set('retry_at', retryAt.toISOString());
    response.redirect(302, url.toString());
  }
}
