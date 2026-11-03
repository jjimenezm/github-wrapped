export class UserNotFoundError extends Error {
  constructor(readonly login: string) {
    super(`GitHub user "${login}" does not exist`);
    this.name = 'UserNotFoundError';
  }
}

export class GithubRateLimitError extends Error {
  constructor(readonly retryAfter: number) {
    super(`GitHub rate limit reached; retry in ${retryAfter}s`);
    this.name = 'GithubRateLimitError';
  }
}

export class GithubUnavailableError extends Error {
  constructor(detail: string) {
    super(`GitHub is unavailable: ${detail}`);
    this.name = 'GithubUnavailableError';
  }
}
