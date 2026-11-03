import type { DateRange } from '@wrapped/shared';
import { mergedPullRequestsQuery } from '@wrapped/shared';
import { GithubUnavailableError, UserNotFoundError } from './github.errors';
import type { GithubTransport, GraphqlResult } from './github.transport';
import {
  MERGED_PULL_REQUESTS,
  OWN_LANGUAGES,
  PREVIOUS_YEAR,
  USER_YEAR,
  type OwnRepository,
  type UserYear,
} from './queries';

/** GraphQL takes instants; a wrap's range is whole UTC days, like the profile calendar. */
const instants = (range: DateRange) => ({
  from: `${range.from}T00:00:00Z`,
  to: `${range.to}T23:59:59Z`,
});

const notFound = (result: GraphqlResult) => result.errors?.some((e) => e.type === 'NOT_FOUND');

/** Typed reads of the four operations; anything missing in a reply becomes a domain error. */
export class GithubClient {
  constructor(private readonly transport: GithubTransport) {}

  async userYear(login: string, range: DateRange): Promise<UserYear> {
    const result = await this.transport.execute('UserYear', USER_YEAR, {
      login,
      ...instants(range),
    });
    const user = (result.data as { user?: UserYear | null } | undefined)?.user;
    if (user) return user;
    if (notFound(result)) throw new UserNotFoundError(login);
    throw new GithubUnavailableError('UserYear returned no user');
  }

  async previousYearTotal(login: string, range: DateRange): Promise<number> {
    const result = await this.transport.execute('PreviousYear', PREVIOUS_YEAR, {
      login,
      ...instants(range),
    });
    const data = result.data as
      | {
          user?: {
            contributionsCollection: { contributionCalendar: { totalContributions: number } };
          };
        }
      | undefined;
    const total = data?.user?.contributionsCollection.contributionCalendar.totalContributions;
    if (typeof total !== 'number')
      throw new GithubUnavailableError('PreviousYear returned no total');
    return total;
  }

  async mergedPullRequests(login: string, range: DateRange): Promise<number> {
    const result = await this.transport.execute('MergedPullRequests', MERGED_PULL_REQUESTS, {
      query: mergedPullRequestsQuery(login, range),
    });
    const count = (result.data as { search?: { issueCount: number } } | undefined)?.search
      ?.issueCount;
    if (typeof count !== 'number') throw new GithubUnavailableError('search returned no count');
    return count;
  }

  async ownRepositories(login: string): Promise<OwnRepository[]> {
    const result = await this.transport.execute('OwnLanguages', OWN_LANGUAGES, { login });
    const nodes = (
      result.data as { user?: { repositories: { nodes: OwnRepository[] } } } | undefined
    )?.user?.repositories.nodes;
    if (!nodes) throw new GithubUnavailableError('OwnLanguages returned no repositories');
    return nodes;
  }
}
