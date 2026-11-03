import { renderArt } from '@wrapped/art';
import type { WrapSnapshot } from '@wrapped/shared';

/**
 * A made-up year that feeds the faded Constelación behind the entry form, as a preview of the
 * card to come. No featured repos, so the sky carries no names; no languages, so it stays in
 * the neutral palette.
 */
const PREVIEW_YEAR: WrapSnapshot = {
  githubUserId: 1,
  login: 'wrapped',
  avatarUrl: '',
  period: { year: 2026, from: '2026-01-01', to: '2026-12-31', complete: true },
  generatedAt: '2026-12-31T00:00:00.000Z',
  metrics: { contributions: 0, commits: null, mergedPRs: null, reviews: null, issues: null },
  privateContributions: 0,
  activeDays: null,
  previousContributions: null,
  weekly: Array.from({ length: 52 }, (_, i) => 6 + ((i * 7) % 23)),
  languages: [],
  otherLanguagesBytes: 0,
  featured: [],
  failedMetrics: [],
};

/** Same bytes on every load; it fills its band edge to edge, cropping rather than letterboxing. */
export const ENTRY_ART_SVG = renderArt('constelacion', PREVIEW_YEAR, {
  locale: 'en',
  animated: true,
}).replace('<svg ', '<svg width="100%" height="100%" preserveAspectRatio="xMidYMid slice" ');
