import {
  previousYearPeriod,
  resolveWrapPeriod,
  type MetricKey,
  type WrapPeriod,
  type WrapSnapshot,
} from '@wrapped/shared';
import { selectFeaturedRepos } from './featured-repos';
import type { GithubClient } from './github.client';
import { summarizeLanguages } from './languages';
import type { ContributionWeek } from './queries';

export interface BuiltSnapshot {
  snapshot: WrapSnapshot;
  /** False when some part failed and was left out: the cache keeps it only briefly. */
  complete: boolean;
}

type Settled<T> = { ok: true; value: T } | { ok: false };

const settle = <T>(promise: Promise<T>): Promise<Settled<T>> =>
  promise.then(
    (value) => ({ ok: true, value }),
    () => ({ ok: false }),
  );

/** Contributions per week and days with any contribution, counting only days inside the period. */
export function calendarStats(weeks: ContributionWeek[], period: WrapPeriod) {
  let activeDays = 0;
  const weekly: number[] = [];
  for (const week of weeks) {
    const days = week.contributionDays.filter((d) => d.date >= period.from && d.date <= period.to);
    if (days.length === 0) continue;
    activeDays += days.filter((d) => d.contributionCount > 0).length;
    weekly.push(days.reduce((sum, d) => sum + d.contributionCount, 0));
  }
  return { weekly, activeDays };
}

/**
 * Builds a person's snapshot for the period the year rule gives for `now`. The main query (user,
 * calendar, repos) must succeed; last year's total, merged PRs and languages are fetched alongside
 * and, if one fails, it is left out (never estimated) and merged PRs are marked for a retry.
 */
export class SnapshotBuilder {
  constructor(private readonly client: GithubClient) {}

  async build(login: string, now: Date): Promise<BuiltSnapshot> {
    const period = resolveWrapPeriod(now);
    const [user, previous, mergedPRs, repos] = await Promise.all([
      this.client.userYear(login, period),
      settle(this.client.previousYearTotal(login, previousYearPeriod(period))),
      settle(this.client.mergedPullRequests(login, period)),
      settle(this.client.ownRepositories(login)),
    ]);

    const collection = user.contributionsCollection;
    const calendar = collection.contributionCalendar;
    const { weekly, activeDays } = calendarStats(calendar.weeks, period);
    const { languages, otherBytes } = repos.ok
      ? summarizeLanguages(repos.value)
      : { languages: [], otherBytes: 0 };
    const failedMetrics: MetricKey[] = mergedPRs.ok ? [] : ['mergedPRs'];

    return {
      complete: previous.ok && mergedPRs.ok && repos.ok,
      snapshot: {
        githubUserId: user.databaseId,
        login: user.login,
        avatarUrl: user.avatarUrl,
        period,
        generatedAt: now.toISOString(),
        metrics: {
          contributions: calendar.totalContributions,
          commits: collection.totalCommitContributions,
          mergedPRs: mergedPRs.ok ? mergedPRs.value : null,
          reviews: collection.totalPullRequestReviewContributions,
          issues: collection.totalIssueContributions,
        },
        privateContributions: collection.restrictedContributionsCount,
        activeDays,
        previousContributions: previous.ok ? previous.value : null,
        weekly,
        languages,
        otherLanguagesBytes: otherBytes,
        featured: selectFeaturedRepos(collection.commitContributionsByRepository, user.login),
        failedMetrics,
      },
    };
  }
}
