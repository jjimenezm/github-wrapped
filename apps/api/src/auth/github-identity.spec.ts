import { FixtureGithubIdentity, HttpGithubIdentity, OAuthFailedError } from './github-identity';

type Reply = { status?: number; body: unknown };

function fakeFetch(replies: Record<string, Reply>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetch = (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    calls.push({ url, init: init ?? {} });
    const reply = replies[url.split('?')[0] ?? ''];
    if (!reply) return Promise.reject(new TypeError(`unexpected ${url}`));
    return Promise.resolve(
      new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 }),
    );
  };
  return { fetch, calls };
}

const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_URL = 'https://api.github.com/user';
const oauth = { clientId: 'Iv1.client', clientSecret: 'oauth-secret' };

describe('HttpGithubIdentity', () => {
  it('trades the code for a token, reads who the person is and returns only id and login', async () => {
    const fake = fakeFetch({
      [TOKEN_URL]: { body: { access_token: 'gho_secret', token_type: 'bearer', scope: '' } },
      [USER_URL]: { body: { id: 4242, login: 'Ana-Dev', email: 'ana@example.dev' } },
    });
    const identity = await new HttpGithubIdentity(oauth, fake.fetch).identify(
      'the-code',
      'http://localhost:3000/api/auth/github/callback',
    );
    expect(identity).toEqual({ githubUserId: 4242, login: 'Ana-Dev' });

    const [exchange, user] = fake.calls;
    expect(exchange?.init.method).toBe('POST');
    expect(JSON.parse(exchange?.init.body as string)).toEqual({
      client_id: 'Iv1.client',
      client_secret: 'oauth-secret',
      code: 'the-code',
      redirect_uri: 'http://localhost:3000/api/auth/github/callback',
    });
    expect(new Headers(user?.init.headers).get('authorization')).toBe('Bearer gho_secret');
  });

  it('fails when GitHub refuses the code', async () => {
    const fake = fakeFetch({
      [TOKEN_URL]: { body: { error: 'bad_verification_code' } },
    });
    await expect(
      new HttpGithubIdentity(oauth, fake.fetch).identify('old', 'cb'),
    ).rejects.toBeInstanceOf(OAuthFailedError);
  });

  it('fails when the user endpoint does not answer with an identity', async () => {
    const fake = fakeFetch({
      [TOKEN_URL]: { body: { access_token: 'gho_secret' } },
      [USER_URL]: { status: 401, body: { message: 'Bad credentials' } },
    });
    await expect(
      new HttpGithubIdentity(oauth, fake.fetch).identify('c', 'cb'),
    ).rejects.toBeInstanceOf(OAuthFailedError);
  });

  it('never puts the access token in the error it raises', async () => {
    const fake = fakeFetch({
      [TOKEN_URL]: { body: { access_token: 'gho_secret' } },
      [USER_URL]: { status: 500, body: {} },
    });
    const error = await new HttpGithubIdentity(oauth, fake.fetch)
      .identify('c', 'cb')
      .catch((e: Error) => e);
    expect((error as Error).message).not.toContain('gho_secret');
  });
});

describe('FixtureGithubIdentity', () => {
  it('reads "fixture:<id>:<login>" codes, for tests and local development', async () => {
    await expect(new FixtureGithubIdentity().identify('fixture:4242:ana-dev')).resolves.toEqual({
      githubUserId: 4242,
      login: 'ana-dev',
    });
  });

  it('refuses any other code', async () => {
    await expect(new FixtureGithubIdentity().identify('real-code')).rejects.toBeInstanceOf(
      OAuthFailedError,
    );
  });
});
