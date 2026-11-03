import type { DateRange } from './year-rule';

/** Metrics that link (↗) to the GitHub view that backs them (R11). */
export type SourceMetric = 'contributions' | 'commits' | 'mergedPRs' | 'reviews' | 'issues';

const search = (query: string, type: string) =>
  `https://github.com/search?q=${encodeURIComponent(query)}&type=${type}`;

export function sourceUrl(metric: SourceMetric, login: string, range: DateRange): string {
  const span = `${range.from}..${range.to}`;

  switch (metric) {
    case 'contributions':
      return `https://github.com/${encodeURIComponent(login)}?tab=overview&from=${range.from}&to=${range.to}`;
    case 'commits':
      return search(`author:${login} committer-date:${span}`, 'commits');
    case 'mergedPRs':
      return search(`is:pr author:${login} is:merged merged:${span}`, 'pullrequests');
    case 'reviews':
      // GitHub search can't filter by review date; this is the closest public view.
      return search(`is:pr reviewed-by:${login} updated:${span}`, 'pullrequests');
    case 'issues':
      return search(`is:issue author:${login} created:${span}`, 'issues');
  }
}
