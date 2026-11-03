import { join } from 'node:path';
import { GithubClient } from './github.client';
import { GithubRateLimitError, GithubUnavailableError, UserNotFoundError } from './github.errors';
import { FixtureGithubTransport, type GithubTransport } from './github.transport';
import { calendarStats, SnapshotBuilder } from './snapshot.builder';

const FIXTURES = join(__dirname, '../../test/fixtures/github');
const NOW = new Date('2026-03-01T12:00:00Z');

/** The fixture transport with some operations replaced, to simulate GitHub failing in parts. */
function transportWith(failures: Record<string, Error>): GithubTransport {
  const fixtures = new FixtureGithubTransport(FIXTURES);
  return {
    execute: (operation, query, variables) => {
      const failure = failures[operation];
      return failure ? Promise.reject(failure) : fixtures.execute(operation, query, variables);
    },
  };
}

const build = (login: string, transport: GithubTransport = new FixtureGithubTransport(FIXTURES)) =>
  new SnapshotBuilder(new GithubClient(transport)).build(login, NOW);

describe('SnapshotBuilder', () => {
  it('builds the whole snapshot of a normal person', async () => {
    const { snapshot, complete } = await build('ana-dev');
    expect(complete).toBe(true);
    expect(snapshot).toMatchObject({
      githubUserId: 4242,
      login: 'ana-dev',
      avatarUrl: 'https://avatars.githubusercontent.com/u/4242',
      period: { year: 2026, from: '2026-01-01', to: '2026-03-01', complete: false },
      generatedAt: '2026-03-01T12:00:00.000Z',
      metrics: { contributions: 285, commits: 312, mergedPRs: 86, reviews: 41, issues: 19 },
      privateContributions: 40,
      activeDays: 50,
      previousContributions: 200,
      weekly: [19, 25, 42, 29, 31, 37, 24, 41, 28, 9],
      otherLanguagesBytes: 40000,
      failedMetrics: [],
    });
    expect(snapshot.languages.map((l) => [l.name, l.bytes])).toEqual([
      ['TypeScript', 480000],
      ['PHP', 310000],
      ['SCSS', 120000],
    ]);
    expect(snapshot.featured.map((r) => r.name)).toEqual([
      'sismos-chile-api',
      'github-wrapped',
      'dotfiles',
    ]);
    expect(snapshot.featured[0]?.demoUrl).toBe('https://sismos.example.dev');
  });

  it('asks GitHub for the period, the same stretch a year before and the exact PR search', async () => {
    const seen: Array<[string, Record<string, unknown>]> = [];
    const fixtures = new FixtureGithubTransport(FIXTURES);
    await build('ana-dev', {
      execute: (operation, query, variables) => {
        seen.push([operation, variables]);
        return fixtures.execute(operation, query, variables);
      },
    });
    expect(Object.fromEntries(seen)).toEqual({
      UserYear: { login: 'ana-dev', from: '2026-01-01T00:00:00Z', to: '2026-03-01T23:59:59Z' },
      PreviousYear: { login: 'ana-dev', from: '2025-01-01T00:00:00Z', to: '2025-03-01T23:59:59Z' },
      MergedPullRequests: { query: 'is:pr author:ana-dev is:merged merged:2026-01-01..2026-03-01' },
      OwnLanguages: { login: 'ana-dev' },
    });
  });

  it('hides merged PRs when the search fails and marks them for a retry', async () => {
    const { snapshot, complete } = await build('pr-falla');
    expect(snapshot.metrics.mergedPRs).toBeNull();
    expect(snapshot.failedMetrics).toEqual(['mergedPRs']);
    expect(snapshot.metrics.contributions).toBe(285);
    expect(complete).toBe(false);
  });

  it('counts zero merged PRs as a real zero, not a failure', async () => {
    const { snapshot, complete } = await build('sin-prs');
    expect(snapshot.metrics.mergedPRs).toBe(0);
    expect(snapshot.failedMetrics).toEqual([]);
    expect(complete).toBe(true);
  });

  it('hides merged PRs when the search hits its own rate limit', async () => {
    const transport = transportWith({
      MergedPullRequests: new GithubRateLimitError(30),
    });
    const { snapshot } = await build('ana-dev', transport);
    expect(snapshot.failedMetrics).toEqual(['mergedPRs']);
  });

  it('drops the comparison when last year fails, without guessing it', async () => {
    const transport = transportWith({
      PreviousYear: new GithubUnavailableError('502'),
    });
    const { snapshot, complete } = await build('ana-dev', transport);
    expect(snapshot.previousContributions).toBeNull();
    expect(snapshot.failedMetrics).toEqual([]);
    expect(complete).toBe(false);
  });

  it('drops the languages when they fail', async () => {
    const transport = transportWith({
      OwnLanguages: new GithubUnavailableError('502'),
    });
    const { snapshot, complete } = await build('ana-dev', transport);
    expect(snapshot.languages).toEqual([]);
    expect(snapshot.otherLanguagesBytes).toBe(0);
    expect(complete).toBe(false);
  });

  it('reports a login that does not exist', async () => {
    await expect(build('nadie-por-aqui')).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('fails the whole preview when GitHub has no quota left for the main query', async () => {
    await expect(build('sin-cuota')).rejects.toEqual(new GithubRateLimitError(120));
  });

  it('builds last year in full when asked in January', async () => {
    const snapshot = (
      await new SnapshotBuilder(new GithubClient(new FixtureGithubTransport(FIXTURES))).build(
        'ana-dev',
        new Date('2027-01-05T09:00:00Z'),
      )
    ).snapshot;
    expect(snapshot.period).toEqual({
      year: 2026,
      from: '2026-01-01',
      to: '2026-12-31',
      complete: true,
    });
  });
});

describe('calendarStats', () => {
  const period = { year: 2026, from: '2026-01-01', to: '2026-01-10', complete: false };
  const day = (date: string, contributionCount: number) => ({ date, contributionCount });

  it('sums each week and counts active days, ignoring days outside the period', () => {
    expect(
      calendarStats(
        [
          { contributionDays: [day('2025-12-31', 9), day('2026-01-01', 2), day('2026-01-02', 0)] },
          { contributionDays: [day('2026-01-04', 5), day('2026-01-10', 1), day('2026-01-11', 7)] },
        ],
        period,
      ),
    ).toEqual({ weekly: [2, 6], activeDays: 3 });
  });

  it('drops weeks that fall entirely outside the period', () => {
    expect(calendarStats([{ contributionDays: [day('2025-12-30', 4)] }], period)).toEqual({
      weekly: [],
      activeDays: 0,
    });
  });
});
