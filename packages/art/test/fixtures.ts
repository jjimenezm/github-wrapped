import type { FeaturedRepo, LanguageShare, WrapSnapshot } from '@wrapped/shared';

export const BASE_URL = 'https://wrapped.jjimenezm.dev';

/**
 * A believable year of weekly contributions: a slow start, a busy stretch and a quiet August.
 * Built from integer arithmetic so every run (and every machine) gets the same numbers.
 */
export function demoWeekly(weeks = 44, phase = 0): number[] {
  return Array.from({ length: weeks }, (_, i) => {
    const wave = ((i * 7 + phase * 13) % 23) - 11;
    const season = i > 30 && i < 35 ? 6 : 24 + ((i * 3 + phase) % 17);
    return Math.max(0, season + wave);
  });
}

export const repo = (name: string, commits: number, languages: string[] = []): FeaturedRepo => ({
  name,
  description: `${name} description`,
  url: `https://github.com/demo/${name}`,
  demoUrl: null,
  stars: 0,
  commits,
  topics: [],
  languages,
});

export const language = (name: string, color: string | null, bytes: number): LanguageShare => ({
  name,
  color,
  bytes,
});

export function makeSnapshot(overrides: Partial<WrapSnapshot> = {}): WrapSnapshot {
  return {
    githubUserId: 583231,
    login: 'jpjimenez',
    avatarUrl: 'https://avatars.githubusercontent.com/u/583231',
    period: { year: 2026, from: '2026-01-01', to: '2026-11-03', complete: false },
    generatedAt: '2026-11-03T12:00:00.000Z',
    metrics: { contributions: 1284, commits: 312, mergedPRs: 86, reviews: 41, issues: 19 },
    privateContributions: 0,
    activeDays: 214,
    previousContributions: 1044,
    weekly: demoWeekly(),
    languages: [
      language('TypeScript', '#3178c6', 480_000),
      language('PHP', '#4F5D95', 310_000),
      language('SCSS', '#c6538c', 120_000),
    ],
    otherLanguagesBytes: 0,
    featured: [
      repo('sismos-chile-api', 128, ['TypeScript']),
      repo('github-wrapped', 96, ['TypeScript']),
      repo('release-to-video', 41, ['PHP']),
    ],
    failedMetrics: [],
    ...overrides,
  };
}

/** The four people of the approved prototype, used by the sample page. */
export const DEMO_SNAPSHOTS: WrapSnapshot[] = [
  makeSnapshot(),
  makeSnapshot({
    githubUserId: 7712004,
    login: 'cata-dev',
    metrics: { contributions: 2031, commits: 540, mergedPRs: 132, reviews: 77, issues: 25 },
    activeDays: 251,
    previousContributions: 1440,
    weekly: demoWeekly(44, 5),
    languages: [
      language('Python', '#3572A5', 570_000),
      language('Jupyter Notebook', '#DA5B0B', 220_000),
      language('Go', '#00ADD8', 110_000),
    ],
    featured: [repo('ml-sismos', 210), repo('notebooks', 140), repo('go-ingest', 66)],
  }),
  makeSnapshot({
    githubUserId: 3390871,
    login: 'nicorust',
    metrics: { contributions: 876, commits: 401, mergedPRs: 38, reviews: 12, issues: 9 },
    activeDays: 162,
    previousContributions: 952,
    weekly: demoWeekly(44, 9),
    languages: [
      language('Rust', '#dea584', 630_000),
      language('C', '#555555', 190_000),
      language('Shell', '#89e051', 90_000),
    ],
    featured: [repo('tiny-db', 190), repo('wasm-synth', 88)],
  }),
  makeSnapshot({
    githubUserId: 12045,
    login: 'fran-ux',
    metrics: { contributions: 1517, commits: 288, mergedPRs: 97, reviews: 64, issues: 31 },
    activeDays: 233,
    previousContributions: 1354,
    weekly: demoWeekly(44, 17),
    languages: [
      language('CSS', '#563d7c', 380_000),
      language('TypeScript', '#3178c6', 350_000),
      language('HTML', '#e34c26', 170_000),
    ],
    featured: [],
  }),
];
