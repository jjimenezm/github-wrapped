import type { FeaturedRepo } from '@wrapped/shared';
import type { RepoContribution } from './queries';

const FEATURED = 3;

/** Only http(s) homepages become a "Demo" link; anything else (javascript:, blanks) is dropped. */
function demoUrl(homepage: string | null): string | null {
  const url = homepage?.trim();
  return url && /^https?:\/\/\S+$/i.test(url) ? url : null;
}

/**
 * "Proyectos con más actividad este año" (R4): the repos with the person's most commits in the
 * period, leaving out empty repos, repos without a description and private ones. A fork only
 * shows up with commits of its own in the period.
 */
export function selectFeaturedRepos(entries: RepoContribution[], login: string): FeaturedRepo[] {
  return entries
    .filter(({ repository: repo, contributions }) => {
      if (repo.isEmpty || repo.isPrivate) return false;
      if (!repo.description?.trim()) return false;
      return contributions.totalCount > 0;
    })
    .sort(
      (a, b) =>
        b.contributions.totalCount - a.contributions.totalCount ||
        b.repository.stargazerCount - a.repository.stargazerCount ||
        a.repository.name.localeCompare(b.repository.name),
    )
    .slice(0, FEATURED)
    .map(({ repository: repo, contributions }) => ({
      name: repo.owner.login.toLowerCase() === login.toLowerCase() ? repo.name : repo.nameWithOwner,
      description: (repo.description ?? '').trim(),
      url: repo.url,
      demoUrl: demoUrl(repo.homepageUrl),
      stars: repo.stargazerCount,
      commits: contributions.totalCount,
      topics: repo.repositoryTopics.nodes.map((n) => n.topic.name),
      languages: repo.languages.nodes.map((n) => n.name),
    }));
}
