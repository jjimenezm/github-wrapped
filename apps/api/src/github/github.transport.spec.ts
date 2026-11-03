import { GithubRateLimitError, GithubUnavailableError } from './github.errors';
import { HttpGithubTransport } from './github.transport';

const NOW_MS = Date.UTC(2026, 2, 1, 12);

function fakeFetch(response: {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetch = (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: url instanceof Request ? url.url : url.toString(), init: init ?? {} });
    return Promise.resolve(
      new Response(JSON.stringify(response.body ?? {}), {
        status: response.status ?? 200,
        headers: response.headers,
      }),
    );
  };
  return { fetch, calls };
}

const transport = (fetch: typeof globalThis.fetch) =>
  new HttpGithubTransport({ token: 'test-token', fetch, now: () => NOW_MS });

describe('HttpGithubTransport', () => {
  it('posts the query with the server token and returns the GraphQL body', async () => {
    const fake = fakeFetch({ body: { data: { search: { issueCount: 3 } } } });
    const result = await transport(fake.fetch).execute('MergedPullRequests', 'query Q { x }', {
      a: 1,
    });
    expect(result).toEqual({ data: { search: { issueCount: 3 } } });
    const [call] = fake.calls;
    expect(call?.url).toBe('https://api.github.com/graphql');
    expect(call?.init.method).toBe('POST');
    const headers = new Headers(call?.init.headers);
    expect(headers.get('authorization')).toBe('bearer test-token');
    expect(headers.get('user-agent')).toBeTruthy();
    expect(JSON.parse(call?.init.body as string)).toEqual({
      query: 'query Q { x }',
      variables: { a: 1 },
    });
  });

  it('turns an exhausted primary quota into a rate limit with the wait until reset', async () => {
    const reset = String(NOW_MS / 1000 + 90);
    const fake = fakeFetch({
      status: 403,
      headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset },
    });
    await expect(transport(fake.fetch).execute('UserYear', 'q', {})).rejects.toEqual(
      new GithubRateLimitError(90),
    );
  });

  it('honors retry-after from a secondary rate limit', async () => {
    const fake = fakeFetch({ status: 429, headers: { 'retry-after': '30' } });
    await expect(transport(fake.fetch).execute('UserYear', 'q', {})).rejects.toEqual(
      new GithubRateLimitError(30),
    );
  });

  it('turns a GraphQL RATE_LIMITED error into a rate limit', async () => {
    const fake = fakeFetch({
      body: { errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded' }] },
    });
    await expect(transport(fake.fetch).execute('UserYear', 'q', {})).rejects.toEqual(
      new GithubRateLimitError(60),
    );
  });

  it.each([401, 500, 502])('reports GitHub as unavailable on HTTP %i', async (status) => {
    const fake = fakeFetch({ status });
    await expect(transport(fake.fetch).execute('UserYear', 'q', {})).rejects.toBeInstanceOf(
      GithubUnavailableError,
    );
  });

  it('reports GitHub as unavailable when the request itself fails', async () => {
    const failing = (() =>
      Promise.reject(new TypeError('fetch failed'))) as typeof globalThis.fetch;
    await expect(transport(failing).execute('UserYear', 'q', {})).rejects.toBeInstanceOf(
      GithubUnavailableError,
    );
  });
});
