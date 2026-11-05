import { seedFor } from '@wrapped/art';
import { publicWrapUrl, type Locale, type WrapSnapshot } from '@wrapped/shared';
import { PNG } from 'pngjs';
import { snapshot } from './fixtures';

/** A render's `--variables-file`, as compositions/wrap/variables.schema.json describes it. */
export interface VideoVariables {
  /** The snapshot as JSON: HyperFrames variables can't be objects. */
  snapshot: string;
  locale: Locale;
  url: string;
  seed: number;
  avatar: string;
}

/**
 * The variables of a published wrap, built the way the schema describes them. Tests and local
 * renders use it; the renderer's video job builds its own against the same schema.
 */
export function videoVariables(
  wrap: WrapSnapshot,
  options: { locale: Locale; publicBaseUrl: string; avatarHref?: string | null },
): VideoVariables {
  const { year } = wrap.period;
  return {
    snapshot: JSON.stringify(wrap),
    locale: options.locale,
    url: publicWrapUrl(options.publicBaseUrl, wrap.login, year),
    seed: seedFor(wrap.githubUserId, year),
    avatar: options.avatarHref ?? '',
  };
}

/** Weekly contributions for most of a year: a slow start, a busy stretch and a quiet August. */
const weeks = (count: number, phase: number) =>
  Array.from({ length: count }, (_, i) => {
    const wave = ((i * 7 + phase * 13) % 23) - 11;
    const season = i > 30 && i < 35 ? 6 : 24 + ((i * 3 + phase) % 17);
    return Math.max(0, season + wave);
  });

const repo = (name: string, commits: number, stars: number, language: string) => ({
  name,
  description: `${name} description`,
  url: `https://github.com/demo/${name}`,
  demoUrl: null,
  stars,
  commits,
  topics: [],
  languages: [language],
});

/** The Spanish video: a full year with every metric and three featured repos. */
export const ES_WRAP: WrapSnapshot = snapshot({
  githubUserId: 583231,
  login: 'jpjimenez',
  period: { year: 2026, from: '2026-01-01', to: '2026-11-03', complete: false },
  generatedAt: '2026-11-03T12:00:00.000Z',
  weekly: weeks(44, 0),
  languages: [
    { name: 'TypeScript', color: '#3178c6', bytes: 480_000 },
    { name: 'PHP', color: '#4F5D95', bytes: 310_000 },
    { name: 'SCSS', color: '#c6538c', bytes: 120_000 },
  ],
  featured: [
    repo('sismos-chile-api', 128, 34, 'TypeScript'),
    repo('github-wrapped', 96, 12, 'TypeScript'),
    repo('release-to-video', 41, 0, 'PHP'),
  ],
});

/** The English video: someone else, a shorter year and a private contributions row. */
export const EN_WRAP: WrapSnapshot = snapshot({
  githubUserId: 7712004,
  login: 'cata-dev',
  period: { year: 2026, from: '2026-01-01', to: '2026-09-30', complete: false },
  generatedAt: '2026-09-30T12:00:00.000Z',
  metrics: { contributions: 2031, commits: 540, mergedPRs: 132, reviews: 77, issues: 25 },
  privateContributions: 318,
  activeDays: 188,
  previousContributions: 1440,
  weekly: weeks(39, 5),
  languages: [
    { name: 'Python', color: '#3572A5', bytes: 570_000 },
    { name: 'Jupyter Notebook', color: '#DA5B0B', bytes: 220_000 },
    { name: 'Go', color: '#00ADD8', bytes: 110_000 },
  ],
  featured: [
    repo('ml-sismos', 210, 58, 'Python'),
    repo('notebooks', 140, 0, 'Jupyter Notebook'),
    repo('go-ingest', 66, 7, 'Go'),
  ],
});

/** A small generated avatar (a soft diagonal gradient) as a PNG data URI: no network needed. */
export function avatarDataUri(size = 96): string {
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const t = (x + y) / (2 * size);
      png.data[i] = Math.round(53 + 120 * t);
      png.data[i + 1] = Math.round(114 + 60 * (1 - t));
      png.data[i + 2] = Math.round(165 + 70 * t);
      png.data[i + 3] = 255;
    }
  }
  return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`;
}
