import { sourceUrl } from '../src';

const range = { from: '2026-01-01', to: '2026-02-15' };

function searchOf(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.host,
    path: parsed.pathname,
    q: parsed.searchParams.get('q'),
    type: parsed.searchParams.get('type'),
  };
}

describe('sourceUrl', () => {
  it('links merged PRs to the exact GitHub search', () => {
    expect(searchOf(sourceUrl('mergedPRs', 'ana-dev', range))).toEqual({
      host: 'github.com',
      path: '/search',
      q: 'is:pr author:ana-dev is:merged merged:2026-01-01..2026-02-15',
      type: 'pullrequests',
    });
  });

  it('encodes the query so it survives being pasted into a link', () => {
    const url = sourceUrl('mergedPRs', 'ana-dev', range);
    expect(url).not.toContain(' ');
    expect(url).toContain('is%3Apr');
  });

  it('links commits to a commit search by author and date', () => {
    expect(searchOf(sourceUrl('commits', 'ana-dev', range))).toMatchObject({
      q: 'author:ana-dev committer-date:2026-01-01..2026-02-15',
      type: 'commits',
    });
  });

  it('links reviews to the closest PR search by reviewer', () => {
    expect(searchOf(sourceUrl('reviews', 'ana-dev', range))).toMatchObject({
      q: 'is:pr reviewed-by:ana-dev updated:2026-01-01..2026-02-15',
      type: 'pullrequests',
    });
  });

  it('links opened issues to an issue search by author and creation date', () => {
    expect(searchOf(sourceUrl('issues', 'ana-dev', range))).toMatchObject({
      q: 'is:issue author:ana-dev created:2026-01-01..2026-02-15',
      type: 'issues',
    });
  });

  it('links contributions to the profile overview for the period', () => {
    const url = new URL(sourceUrl('contributions', 'ana-dev', range));
    expect(url.host).toBe('github.com');
    expect(url.pathname).toBe('/ana-dev');
    expect(url.searchParams.get('tab')).toBe('overview');
    expect(url.searchParams.get('from')).toBe('2026-01-01');
    expect(url.searchParams.get('to')).toBe('2026-02-15');
  });
});
