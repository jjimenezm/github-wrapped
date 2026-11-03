import {
  createParamDecorator,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { InvalidRequestError } from '../common/invalid-request.error';
import type { WrapRecord } from '../wraps/wraps.repository';
import { WrapsService } from '../wraps/wraps.service';
import type { Identity } from './github-identity';
import { SessionService, UnauthenticatedError } from './session.service';

interface AuthedRequest extends Request {
  identity?: Identity;
  ownedWrap?: WrapRecord;
}

/** Valid years in a URL; anything else can't be a wrap. */
export function parseYear(raw: string): number {
  const year = Number(raw);
  if (!Number.isInteger(year) || year < 2008 || year > 2100) throw new InvalidRequestError('year');
  return year;
}

/** 401 without a valid session. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const identity = this.sessions.read(request);
    if (!identity) throw new UnauthenticatedError();
    request.identity = identity;
    return true;
  }
}

/** 401 without a session, 404 without a wrap, 403 when the wrap belongs to another GitHub account. */
@Injectable()
export class OwnerGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly wraps: WrapsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const identity = this.sessions.read(request);
    if (!identity) throw new UnauthenticatedError();
    const { login = '', year = '' } = request.params as Record<string, string | undefined>;
    request.identity = identity;
    request.ownedWrap = await this.wraps.findOwned(identity, login, parseYear(year));
    return true;
  }
}

export const CurrentIdentity = createParamDecorator(
  (_: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AuthedRequest>().identity as Identity,
);

export const OwnedWrap = createParamDecorator(
  (_: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AuthedRequest>().ownedWrap as WrapRecord,
);
