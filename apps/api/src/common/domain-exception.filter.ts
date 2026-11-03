import { Catch, HttpStatus, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { OAuthStateError, UnauthenticatedError } from '../auth/session.service';
import { FileNotFoundError } from '../files/files.controller';
import {
  GithubRateLimitError,
  GithubUnavailableError,
  UserNotFoundError,
} from '../github/github.errors';
import { InvalidLoginError } from '../wraps/preview.errors';
import {
  ConcurrentUpdateError,
  ImagesNotFailedError,
  NotOwnerError,
  RegenerateTooSoonError,
  WrapDeletedError,
  WrapNotFoundError,
  YearFrozenError,
} from '../wraps/wrap.errors';
import { InvalidRequestError } from './invalid-request.error';

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  retryAfter?: number;
  retryAt?: string;
}

type Mapping = [new (...args: never[]) => Error, (error: never) => ErrorBody];

const body = (statusCode: number, code: string) => (error: Error) => ({
  statusCode,
  code,
  message: error.message,
});

/** Each domain error as an HTTP status and a stable `code` the web can translate (R1, R6, R18). */
const MAPPINGS: Mapping[] = [
  [InvalidLoginError, body(HttpStatus.BAD_REQUEST, 'INVALID_LOGIN')],
  [InvalidRequestError, body(HttpStatus.BAD_REQUEST, 'INVALID_REQUEST')],
  [OAuthStateError, body(HttpStatus.BAD_REQUEST, 'OAUTH_STATE_INVALID')],
  [UnauthenticatedError, body(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED')],
  [NotOwnerError, body(HttpStatus.FORBIDDEN, 'NOT_OWNER')],
  [UserNotFoundError, body(HttpStatus.NOT_FOUND, 'USER_NOT_FOUND')],
  [WrapNotFoundError, body(HttpStatus.NOT_FOUND, 'WRAP_NOT_FOUND')],
  [FileNotFoundError, body(HttpStatus.NOT_FOUND, 'FILE_NOT_FOUND')],
  [WrapDeletedError, body(HttpStatus.GONE, 'WRAP_DELETED')],
  [YearFrozenError, body(HttpStatus.CONFLICT, 'YEAR_FROZEN')],
  [ImagesNotFailedError, body(HttpStatus.CONFLICT, 'IMAGES_NOT_FAILED')],
  [ConcurrentUpdateError, body(HttpStatus.CONFLICT, 'CONCURRENT_UPDATE')],
  [
    RegenerateTooSoonError,
    (error: RegenerateTooSoonError) => ({
      ...body(HttpStatus.TOO_MANY_REQUESTS, 'REGENERATE_TOO_SOON')(error),
      retryAt: error.retryAt.toISOString(),
    }),
  ],
  [
    GithubRateLimitError,
    (error: GithubRateLimitError) => ({
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      code: 'GITHUB_RATE_LIMITED',
      message: 'GitHub is busy right now; try again in a moment.',
      retryAfter: error.retryAfter,
    }),
  ],
  [
    GithubUnavailableError,
    () => ({
      statusCode: HttpStatus.BAD_GATEWAY,
      code: 'GITHUB_UNAVAILABLE',
      message: 'GitHub did not answer; try again in a moment.',
    }),
  ],
];

const HANDLED = MAPPINGS.map(([type]) => type);

@Catch(...HANDLED)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(error: Error, host: ArgumentsHost): void {
    const mapping = MAPPINGS.find(([type]) => error instanceof type);
    const result = (mapping?.[1] as ((e: Error) => ErrorBody) | undefined)?.(error) ?? {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL',
      message: 'Something went wrong.',
    };
    const response = host.switchToHttp().getResponse<Response>();
    if (result.retryAfter !== undefined) {
      response.setHeader('Retry-After', String(result.retryAfter));
    }
    response.status(result.statusCode).json(result);
  }
}
