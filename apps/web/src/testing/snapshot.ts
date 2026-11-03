import type { WrapSnapshot } from '@wrapped/shared';

/** A complete, believable snapshot for specs; override only what the test is about. */
export function demoSnapshot(overrides: Partial<WrapSnapshot> = {}): WrapSnapshot {
  return {
    githubUserId: 583231,
    login: 'ana-dev',
    avatarUrl: 'https://avatars.githubusercontent.com/u/583231',
    period: { year: 2026, from: '2026-01-01', to: '2026-11-03', complete: false },
    generatedAt: '2026-11-03T12:00:00.000Z',
    metrics: { contributions: 1284, commits: 312, mergedPRs: 86, reviews: 41, issues: 19 },
    privateContributions: 0,
    activeDays: 214,
    previousContributions: 1044,
    weekly: [3, 8, 12, 5, 0, 9],
    languages: [{ name: 'TypeScript', color: '#3178c6', bytes: 480_000 }],
    otherLanguagesBytes: 0,
    featured: [],
    failedMetrics: [],
    ...overrides,
  };
}
