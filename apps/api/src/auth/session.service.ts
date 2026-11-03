import { Inject, Injectable } from '@nestjs/common';
import type { CardStyle, Locale, OAuthIntent } from '@wrapped/shared';
import type { CookieOptions, Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { CLOCK, type Clock } from '../common/clock';
import { APP_CONFIG, type AppConfig } from '../config';
import type { Identity } from './github-identity';
import { signToken, verifyToken, type Expiring } from './signed-token';

export const SESSION_COOKIE = 'gw_session';
export const OAUTH_COOKIE = 'gw_oauth';
const SESSION_SECONDS = 2 * 60 * 60;
const OAUTH_SECONDS = 10 * 60;

/** What the web asked for before sending the person to GitHub; it travels signed in `state`. */
export interface OAuthRequest {
  login: string;
  intent: OAuthIntent;
  cardStyle?: CardStyle;
  locale?: Locale;
  year?: number;
}

export class OAuthStateError extends Error {
  constructor() {
    super('The GitHub login could not be verified; start again.');
    this.name = 'OAuthStateError';
  }
}

export class UnauthenticatedError extends Error {
  constructor() {
    super('Sign in with GitHub first.');
    this.name = 'UnauthenticatedError';
  }
}

type Session = Identity & Expiring;
type State = OAuthRequest & Expiring & { nonce: string };

/**
 * Short sessions in an httpOnly, SameSite=Lax cookie, signed by the api; no GitHub token anywhere.
 * The OAuth `state` is signed too and tied to a nonce cookie, so a callback only completes in the
 * browser that started it.
 */
@Injectable()
export class SessionService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  read(request: Request): Identity | null {
    const token = (request.cookies as Record<string, string | undefined> | undefined)?.[
      SESSION_COOKIE
    ];
    const session = token
      ? verifyToken<Session>(token, this.config.sessionSecret, this.nowMs())
      : null;
    return session ? { githubUserId: session.githubUserId, login: session.login } : null;
  }

  open(response: Response, identity: Identity): void {
    const token = signToken(
      { ...identity, exp: this.expiry(SESSION_SECONDS) },
      this.config.sessionSecret,
    );
    response.cookie(SESSION_COOKIE, token, this.cookie(SESSION_SECONDS, '/'));
  }

  close(response: Response): void {
    response.clearCookie(SESSION_COOKIE, this.cookie(0, '/'));
  }

  /** Signs the request as `state` and leaves its nonce in a cookie for the callback to check. */
  startOAuth(response: Response, request: OAuthRequest): string {
    const nonce = randomBytes(16).toString('base64url');
    response.cookie(OAUTH_COOKIE, nonce, this.cookie(OAUTH_SECONDS, '/api/auth'));
    return signToken(
      { ...request, nonce, exp: this.expiry(OAUTH_SECONDS) },
      this.config.sessionSecret,
    );
  }

  finishOAuth(request: Request, response: Response, stateToken: string): OAuthRequest {
    const nonce = (request.cookies as Record<string, string | undefined> | undefined)?.[
      OAUTH_COOKIE
    ];
    response.clearCookie(OAUTH_COOKIE, this.cookie(0, '/api/auth'));
    const state = verifyToken<State>(stateToken, this.config.sessionSecret, this.nowMs());
    if (!state || !nonce || state.nonce !== nonce) throw new OAuthStateError();
    const { login, intent, cardStyle, locale, year } = state;
    return { login, intent, cardStyle, locale, year };
  }

  private cookie(seconds: number, path: string): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.production,
      path,
      ...(seconds > 0 ? { maxAge: seconds * 1000 } : {}),
    };
  }

  private nowMs() {
    return this.clock().getTime();
  }

  private expiry(seconds: number) {
    return Math.floor(this.nowMs() / 1000) + seconds;
  }
}
