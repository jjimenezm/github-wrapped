/**
 * The four GraphQL operations behind a snapshot, with the shapes they return. Kept as strings in
 * TypeScript (not .graphql files) so the build and Jest need no loader.
 */

export const USER_YEAR = `
  query UserYear($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      databaseId
      login
      avatarUrl
      contributionsCollection(from: $from, to: $to) {
        restrictedContributionsCount
        totalCommitContributions
        totalIssueContributions
        totalPullRequestReviewContributions
        contributionCalendar {
          totalContributions
          weeks { contributionDays { date contributionCount } }
        }
        commitContributionsByRepository(maxRepositories: 25) {
          contributions { totalCount }
          repository {
            name
            nameWithOwner
            owner { login }
            description
            url
            homepageUrl
            stargazerCount
            isFork
            isEmpty
            isPrivate
            languages(first: 3, orderBy: { field: SIZE, direction: DESC }) { nodes { name } }
            repositoryTopics(first: 5) { nodes { topic { name } } }
          }
        }
      }
    }
  }`;

export const PREVIOUS_YEAR = `
  query PreviousYear($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar { totalContributions }
      }
    }
  }`;

export const MERGED_PULL_REQUESTS = `
  query MergedPullRequests($query: String!) {
    search(query: $query, type: ISSUE, first: 1) { issueCount }
  }`;

/** Public repos the person owns, not forks, by recent activity: the source of language bytes. */
export const OWN_LANGUAGES = `
  query OwnLanguages($login: String!) {
    user(login: $login) {
      repositories(
        first: 100
        ownerAffiliations: OWNER
        isFork: false
        privacy: PUBLIC
        orderBy: { field: PUSHED_AT, direction: DESC }
      ) {
        nodes {
          isFork
          languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
            edges { size node { name color } }
          }
        }
      }
    }
  }`;

export interface ContributionDay {
  date: string;
  contributionCount: number;
}

export interface ContributionWeek {
  contributionDays: ContributionDay[];
}

export interface RepoContribution {
  contributions: { totalCount: number };
  repository: {
    name: string;
    nameWithOwner: string;
    owner: { login: string };
    description: string | null;
    url: string;
    homepageUrl: string | null;
    stargazerCount: number;
    isFork: boolean;
    isEmpty: boolean;
    isPrivate: boolean;
    languages: { nodes: Array<{ name: string }> };
    repositoryTopics: { nodes: Array<{ topic: { name: string } }> };
  };
}

export interface UserYear {
  databaseId: number;
  login: string;
  avatarUrl: string;
  contributionsCollection: {
    restrictedContributionsCount: number;
    totalCommitContributions: number;
    totalIssueContributions: number;
    totalPullRequestReviewContributions: number;
    contributionCalendar: { totalContributions: number; weeks: ContributionWeek[] };
    commitContributionsByRepository: RepoContribution[];
  };
}

export interface OwnRepository {
  isFork: boolean;
  languages: { edges: Array<{ size: number; node: { name: string; color: string | null } }> };
}
