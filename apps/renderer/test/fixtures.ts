import type { WrapSnapshot } from '@wrapped/shared';
import type { RenderableWrap } from '../src/images/render-store';

export const WRAP_ID = '3f0c8a52-1b9e-4c7a-9d10-5e2f6b7a8c9d';
export const BASE_URL = 'https://wrapped.jjimenezm.dev';

export const snapshot = (overrides: Partial<WrapSnapshot> = {}): WrapSnapshot => ({
  githubUserId: 4242,
  login: 'ana-dev',
  avatarUrl: 'https://avatars.githubusercontent.com/u/4242',
  period: { year: 2026, from: '2026-01-01', to: '2026-03-01', complete: false },
  generatedAt: '2026-03-01T12:00:00.000Z',
  metrics: { contributions: 1284, commits: 312, mergedPRs: 86, reviews: 41, issues: 19 },
  privateContributions: 0,
  activeDays: 214,
  previousContributions: 1044,
  weekly: [19, 25, 42, 29, 31, 37, 24, 41, 28, 9],
  languages: [
    { name: 'TypeScript', color: '#3178c6', bytes: 480_000 },
    { name: 'PHP', color: '#4F5D95', bytes: 310_000 },
  ],
  otherLanguagesBytes: 40_000,
  featured: [
    {
      name: 'sismos-chile-api',
      description: 'API REST de sismos.',
      url: 'https://github.com/ana-dev/sismos-chile-api',
      demoUrl: null,
      stars: 34,
      commits: 128,
      topics: [],
      languages: ['TypeScript'],
    },
  ],
  failedMetrics: [],
  ...overrides,
});

export const renderableWrap = (overrides: Partial<RenderableWrap> = {}): RenderableWrap => ({
  id: WRAP_ID,
  login: 'ana-dev',
  year: 2026,
  locale: 'es',
  cardStyle: 'huella',
  snapshot: snapshot(),
  status: 'published',
  imagesVersion: 1,
  imagesReadyVersion: null,
  imagesStatus: 'queued',
  ...overrides,
});
