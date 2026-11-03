/** Who signed in: GitHub's numeric id (ownership) and current login. Nothing else is kept. */
export interface Identity {
  githubUserId: number;
  login: string;
}

export class OAuthFailedError extends Error {
  constructor(detail: string) {
    super(`GitHub login failed: ${detail}`);
    this.name = 'OAuthFailedError';
  }
}

/** Turns the code GitHub sends back into an identity. */
export interface GithubIdentity {
  identify(code: string, redirectUri: string): Promise<Identity>;
}

export const GITHUB_IDENTITY = Symbol('GITHUB_IDENTITY');

const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_URL = 'https://api.github.com/user';
const TIMEOUT_MS = 10_000;

/**
 * The OAuth web flow without scopes: the code becomes a token only to read `GET /user`, and the
 * token is dropped right there. It is never stored, logged or put in an error.
 */
export class HttpGithubIdentity implements GithubIdentity {
  constructor(
    private readonly oauth: { clientId: string; clientSecret: string },
    private readonly fetch: typeof globalThis.fetch = globalThis.fetch,
  ) {}

  async identify(code: string, redirectUri: string): Promise<Identity> {
    const exchange = await this.request(TOKEN_URL, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: this.oauth.clientId,
        client_secret: this.oauth.clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
    const token = (exchange as { access_token?: unknown }).access_token;
    if (typeof token !== 'string') {
      const reason = (exchange as { error?: unknown }).error;
      throw new OAuthFailedError(
        `code exchange refused (${typeof reason === 'string' ? reason : 'no token'})`,
      );
    }

    const user = (await this.request(USER_URL, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'user-agent': 'github-wrapped',
      },
    })) as { id?: unknown; login?: unknown };
    if (typeof user.id !== 'number' || typeof user.login !== 'string') {
      throw new OAuthFailedError('GitHub did not say who signed in');
    }
    return { githubUserId: user.id, login: user.login };
  }

  private async request(url: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new OAuthFailedError(`${url} did not answer`);
    }
    if (!response.ok) throw new OAuthFailedError(`${url} answered HTTP ${response.status}`);
    return response.json();
  }
}

/** Fixture mode only: the code `fixture:<id>:<login>` signs in as that person, no GitHub involved. */
export class FixtureGithubIdentity implements GithubIdentity {
  identify(code: string): Promise<Identity> {
    const match = /^fixture:(\d+):([a-zA-Z\d-]+)$/.exec(code);
    if (!match) return Promise.reject(new OAuthFailedError('not a fixture code'));
    return Promise.resolve({ githubUserId: Number(match[1]), login: match[2] });
  }
}
