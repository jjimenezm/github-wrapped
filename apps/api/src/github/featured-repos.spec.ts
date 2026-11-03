import { selectFeaturedRepos } from './featured-repos';
import type { RepoContribution } from './queries';

const entry = (
  name: string,
  commits: number,
  repo: Partial<RepoContribution['repository']> = {},
): RepoContribution => ({
  contributions: { totalCount: commits },
  repository: {
    name,
    nameWithOwner: `ana-dev/${name}`,
    owner: { login: 'ana-dev' },
    description: `${name} does something real.`,
    url: `https://github.com/ana-dev/${name}`,
    homepageUrl: null,
    stargazerCount: 0,
    isFork: false,
    isEmpty: false,
    isPrivate: false,
    languages: { nodes: [{ name: 'TypeScript' }] },
    repositoryTopics: { nodes: [] },
    ...repo,
  },
});

const names = (entries: RepoContribution[]) =>
  selectFeaturedRepos(entries, 'ana-dev').map((r) => r.name);

describe('selectFeaturedRepos', () => {
  it('keeps the three repos with the most commits in the period', () => {
    expect(names([entry('a', 5), entry('b', 50), entry('c', 20), entry('d', 30)])).toEqual([
      'b',
      'd',
      'c',
    ]);
  });

  it('breaks ties by stars and then by name, so the order never flickers', () => {
    expect(
      names([entry('zeta', 10), entry('alfa', 10), entry('beta', 10, { stargazerCount: 3 })]),
    ).toEqual(['beta', 'alfa', 'zeta']);
  });

  it('leaves out empty repos, repos without description and private repos', () => {
    expect(
      names([
        entry('empty', 90, { isEmpty: true }),
        entry('no-description', 80, { description: null }),
        entry('blank-description', 70, { description: '   ' }),
        entry('private', 60, { isPrivate: true }),
        entry('real', 1),
      ]),
    ).toEqual(['real']);
  });

  it('keeps a fork only when it has the person’s own commits in the period', () => {
    expect(
      names([
        entry('fork-with-commits', 12, { isFork: true }),
        entry('fork-without', 0, { isFork: true }),
      ]),
    ).toEqual(['fork-with-commits']);
  });

  it('leaves out repos without commits in the period', () => {
    expect(names([entry('quiet', 0)])).toEqual([]);
  });

  it('shows the owner for repos that belong to someone else', () => {
    const [own, other] = selectFeaturedRepos(
      [
        entry('mine', 20, { owner: { login: 'Ana-Dev' } }),
        entry('design-system', 10, {
          owner: { login: 'octo-org' },
          nameWithOwner: 'octo-org/design-system',
        }),
      ],
      'ana-dev',
    );
    expect(own?.name).toBe('mine');
    expect(other?.name).toBe('octo-org/design-system');
  });

  it.each([
    ['https://demo.example.dev', 'https://demo.example.dev'],
    ['http://demo.example.dev/app', 'http://demo.example.dev/app'],
    [null, null],
    ['  ', null],
    ['javascript:alert(1)', null],
    ['demo.example.dev', null],
  ])('turns homepage %p into demo link %p (only http/https)', (homepageUrl, expected) => {
    const [repo] = selectFeaturedRepos([entry('app', 1, { homepageUrl })], 'ana-dev');
    expect(repo?.demoUrl).toBe(expected);
  });

  it('maps the repo into the snapshot shape', () => {
    const [repo] = selectFeaturedRepos(
      [
        entry('api', 7, {
          stargazerCount: 34,
          languages: { nodes: [{ name: 'TypeScript' }, { name: 'Shell' }] },
          repositoryTopics: {
            nodes: [{ topic: { name: 'nestjs' } }, { topic: { name: 'redis' } }],
          },
        }),
      ],
      'ana-dev',
    );
    expect(repo).toEqual({
      name: 'api',
      description: 'api does something real.',
      url: 'https://github.com/ana-dev/api',
      demoUrl: null,
      stars: 34,
      commits: 7,
      topics: ['nestjs', 'redis'],
      languages: ['TypeScript', 'Shell'],
    });
  });
});
