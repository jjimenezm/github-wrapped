import { Catch, HttpStatus, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import {
  GithubRateLimitError,
  GithubUnavailableError,
  UserNotFoundError,
} from '../github/github.errors';
import { InvalidLoginError } from '../wraps/preview.errors';

type DomainError =
  InvalidLoginError | UserNotFoundError | GithubRateLimitError | GithubUnavailableError;

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  retryAfter?: number;
}

function toBody(error: DomainError): ErrorBody {
  if (error instanceof InvalidLoginError) {
    return { statusCode: HttpStatus.BAD_REQUEST, code: 'INVALID_LOGIN', message: error.message };
  }
  if (error instanceof UserNotFoundError) {
    return { statusCode: HttpStatus.NOT_FOUND, code: 'USER_NOT_FOUND', message: error.message };
  }
  if (error instanceof GithubRateLimitError) {
    return {
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      code: 'GITHUB_RATE_LIMITED',
      message: 'GitHub is busy right now; try again in a moment.',
      retryAfter: error.retryAfter,
    };
  }
  return {
    statusCode: HttpStatus.BAD_GATEWAY,
    code: 'GITHUB_UNAVAILABLE',
    message: 'GitHub did not answer; try again in a moment.',
  };
}

/** Domain errors as HTTP answers with a stable `code` the web can translate (R1, R18). */
@Catch(InvalidLoginError, UserNotFoundError, GithubRateLimitError, GithubUnavailableError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost): void {
    const body = toBody(error);
    const response = host.switchToHttp().getResponse<Response>();
    if (body.retryAfter !== undefined) response.setHeader('Retry-After', String(body.retryAfter));
    response.status(body.statusCode).json(body);
  }
}
