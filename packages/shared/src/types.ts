import type { WrapPeriod } from './year-rule';

/** Languages a wrap can be published in (R17). */
export const SUPPORTED_LOCALES = ['es', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** The three generative card styles a person can choose to share (R5). */
export const CARD_STYLES = ['huella', 'cordillera', 'constelacion'] as const;
export type CardStyle = (typeof CARD_STYLES)[number];

export const METRIC_KEYS = ['contributions', 'commits', 'mergedPRs', 'reviews', 'issues'] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

/** A metric GitHub returned (`number`) or one that is hidden because it doesn't exist or failed (`null`). */
export type Metric = number | null;

export type ImagesStatus = 'queued' | 'ready' | 'failed';
/** `none` means there is no video yet, so the video icon stays hidden. */
export type VideoStatus = 'none' | 'queued' | 'rendering' | 'ready' | 'failed';

export interface LanguageShare {
  name: string;
  /** GitHub's linguist color; null for languages without one (the art falls back to a neutral palette). */
  color: string | null;
  bytes: number;
}

export interface FeaturedRepo {
  name: string;
  description: string;
  url: string;
  /** The repo's `homepage`; the "Demo" button only shows when it exists. */
  demoUrl: string | null;
  stars: number;
  commits: number;
  topics: string[];
  languages: string[];
}

export interface WrapSnapshot {
  githubUserId: number;
  login: string;
  avatarUrl: string;
  period: WrapPeriod;
  generatedAt: string;
  metrics: Record<MetricKey, Metric>;
  /**
   * Contributions to private repos, already inside `metrics.contributions` (only when the person
   * shows private contributions on their profile). GitHub gives just the total: no repo, no kind.
   */
  privateContributions: number;
  activeDays: Metric;
  previousContributions: Metric;
  /** Contributions per week, oldest first. */
  weekly: number[];
  /** The top three languages by bytes, strongest first. */
  languages: LanguageShare[];
  /** Bytes of every language past the top three ("Otros" in the bar); counts toward percentages. */
  otherLanguagesBytes: number;
  featured: FeaturedRepo[];
  /** Metrics that failed to load (as opposed to not existing), so they can be retried before publishing. */
  failedMetrics: MetricKey[];
}
