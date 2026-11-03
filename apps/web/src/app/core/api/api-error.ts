import { HttpErrorResponse } from '@angular/common/http';

/** `NETWORK`: the request never got an answer. `UNKNOWN`: an answer without the api's error body. */
export type ClientErrorCode = 'NETWORK' | 'UNKNOWN';

interface ApiErrorBody {
  code: string;
  retryAfter?: unknown;
  retryAt?: unknown;
}

function isApiErrorBody(body: unknown): body is ApiErrorBody {
  return (
    typeof body === 'object' && body !== null && typeof (body as ApiErrorBody).code === 'string'
  );
}

const seconds = (value: unknown): number | null => {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

/** A failed api call, reduced to what the screens translate: the stable `code` and when to retry. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** The api's `code` (`USER_NOT_FOUND`, `GITHUB_RATE_LIMITED`…) or a {@link ClientErrorCode}. */
    readonly code: string,
    /** Seconds to wait before trying again, from the body or the `Retry-After` header. */
    readonly retryAfter: number | null = null,
    /** When a once-a-day action opens again (ISO date), for the publish screens. */
    readonly retryAt: string | null = null,
  ) {
    super(code);
    this.name = 'ApiError';
  }

  static from(error: unknown): ApiError {
    if (error instanceof ApiError) return error;
    if (!(error instanceof HttpErrorResponse)) return new ApiError(0, 'UNKNOWN');
    if (error.status === 0) return new ApiError(0, 'NETWORK');
    if (!isApiErrorBody(error.error)) return new ApiError(error.status, 'UNKNOWN');
    const body = error.error;
    return new ApiError(
      error.status,
      body.code,
      seconds(body.retryAfter) ?? seconds(error.headers.get('Retry-After')),
      typeof body.retryAt === 'string' ? body.retryAt : null,
    );
  }
}
