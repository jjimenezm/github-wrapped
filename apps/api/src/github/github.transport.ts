import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GithubRateLimitError, GithubUnavailableError } from './github.errors';

export interface GraphqlError {
  type?: string;
  message: string;
}

export interface GraphqlResult {
  data?: unknown;
  errors?: GraphqlError[];
}

/** One GraphQL round trip. The client on top turns results into domain data and errors. */
export interface GithubTransport {
  execute(
    operation: string,
    query: string,
    variables: Record<string, unknown>,
  ): Promise<GraphqlResult>;
}

export const GITHUB_TRANSPORT = Symbol('GITHUB_TRANSPORT');

const ENDPOINT = 'https://api.github.com/graphql';
const TIMEOUT_MS = 10_000;
const DEFAULT_WAIT_SECONDS = 60;

export interface HttpTransportOptions {
  token: string;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
}

export class HttpGithubTransport implements GithubTransport {
  private readonly fetch: typeof globalThis.fetch;
  private readonly now: () => number;

  constructor(private readonly options: HttpTransportOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
  }

  async execute(operation: string, query: string, variables: Record<string, unknown>) {
    let response: Response;
    try {
      response = await this.fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `bearer ${this.options.token}`,
          'content-type': 'application/json',
          'user-agent': 'github-wrapped',
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (cause) {
      throw new GithubUnavailableError(`${operation}: ${String(cause)}`);
    }

    const wait = this.rateLimitWait(response);
    if (wait !== null) throw new GithubRateLimitError(wait);
    if (!response.ok) throw new GithubUnavailableError(`${operation}: HTTP ${response.status}`);

    const body = (await response.json()) as GraphqlResult;
    if (body.errors?.some((e) => e.type === 'RATE_LIMITED')) {
      throw new GithubRateLimitError(DEFAULT_WAIT_SECONDS);
    }
    return body;
  }

  /** Seconds to wait when GitHub says the quota is gone (primary or secondary limit), else null. */
  private rateLimitWait(response: Response): number | null {
    if (response.status !== 403 && response.status !== 429) return null;
    const retryAfter = Number(response.headers.get('retry-after'));
    if (retryAfter > 0) return Math.ceil(retryAfter);
    if (response.headers.get('x-ratelimit-remaining') === '0') {
      const reset = Number(response.headers.get('x-ratelimit-reset'));
      return reset > 0 ? Math.max(1, Math.ceil(reset - this.now() / 1000)) : DEFAULT_WAIT_SECONDS;
    }
    return response.status === 429 ? DEFAULT_WAIT_SECONDS : null;
  }
}

type FixtureEntry =
  GraphqlResult | { httpStatus: number } | { rateLimited: { retryAfter: number } };

const NOT_FOUND: GraphqlResult = {
  data: { user: null },
  errors: [{ type: 'NOT_FOUND', message: 'Could not resolve to a User' }],
};

/**
 * Answers from `<dir>/<login>.json`, one entry per operation. An entry can also simulate an HTTP
 * failure (`httpStatus`) or an exhausted quota (`rateLimited`). A login without a file doesn't exist.
 */
export class FixtureGithubTransport implements GithubTransport {
  constructor(private readonly dir: string) {}

  async execute(operation: string, _query: string, variables: Record<string, unknown>) {
    const login = this.loginOf(variables);
    if (!login) return NOT_FOUND;
    let fixtures: Record<string, FixtureEntry>;
    try {
      fixtures = JSON.parse(await readFile(join(this.dir, `${login}.json`), 'utf8')) as Record<
        string,
        FixtureEntry
      >;
    } catch {
      return NOT_FOUND;
    }
    const entry = fixtures[operation];
    if (!entry) throw new GithubUnavailableError(`no fixture for ${operation} of ${login}`);
    if ('rateLimited' in entry) throw new GithubRateLimitError(entry.rateLimited.retryAfter);
    if ('httpStatus' in entry) throw new GithubUnavailableError(`HTTP ${entry.httpStatus}`);
    return entry;
  }

  /** The login from the variables (or the search's `author:`), only if it is safe as a file name. */
  private loginOf(variables: Record<string, unknown>): string | null {
    const search = typeof variables.query === 'string' ? variables.query : '';
    const fromSearch = /author:(\S+)/.exec(search)?.[1];
    const raw = typeof variables.login === 'string' ? variables.login : (fromSearch ?? '');
    const login = raw.toLowerCase();
    return /^[a-z\d-]+$/.test(login) ? login : null;
  }
}
